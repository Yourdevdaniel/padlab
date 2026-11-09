mod device;
mod ds4;
mod dualsense;
#[cfg(windows)]
mod xbox;

use device::{Info, Kind, Output, Pad};
use hidapi::{BusType, DeviceInfo, HidApi, HidDevice};
use serde::Serialize;
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::Mutex;
use std::thread::sleep;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};

/// Where outputs go. HID controllers get their own write handle, so a write never waits for a read.
enum Writer {
    Hid { dev: HidDevice, kind: Kind, bluetooth: bool },
    #[cfg(windows)]
    Xbox(windows::Gaming::Input::Gamepad),
}

#[derive(Default)]
struct Shared {
    writer: Mutex<Option<Writer>>,
    output: Mutex<Output>,
    seq: AtomicU8,
    /// The controller found last, for a page that starts listening after it was found.
    info: Mutex<Option<Info>>,
}

fn write(shared: &Shared, setup: bool) {
    let out = shared.output.lock().unwrap().clone();
    match shared.writer.lock().unwrap().as_ref() {
        Some(Writer::Hid { dev, kind: Kind::DualSense, bluetooth }) => {
            let seq = shared.seq.fetch_add(1, Ordering::Relaxed);
            let _ = dev.write(&dualsense::output_report(&out, *bluetooth, setup, seq));
        }
        Some(Writer::Hid { dev, bluetooth, .. }) => {
            let _ = dev.write(&ds4::output_report(&out, *bluetooth));
        }
        #[cfg(windows)]
        Some(Writer::Xbox(g)) => xbox::vibrate(g, &out),
        None => {}
    }
}

/// The controller keeps the last effect it got, even after the app is gone: on the way out, the
/// triggers go free and the motors stop.
fn release(app: &AppHandle) {
    let shared = app.state::<Shared>();
    {
        let mut o = shared.output.lock().unwrap();
        o.rumble = [0, 0];
        o.impulse = [0, 0];
        o.trigger_left = vec![0x05];
        o.trigger_right = vec![0x05];
    }
    write(&shared, false);
}

#[tauri::command]
fn set_output(output: Output, shared: State<Shared>) {
    *shared.output.lock().unwrap() = output;
    write(&shared, false);
}

/// The page asks once it listens, so a controller found before that isn't missed.
#[tauri::command]
fn hello(shared: State<Shared>) -> Option<Info> {
    shared.info.lock().unwrap().clone()
}

fn announce(app: &AppHandle, info: Option<Info>) {
    let _ = app.emit("pad-info", &info);
    *app.state::<Shared>().info.lock().unwrap() = info;
}

#[derive(Serialize, Clone)]
struct Frame {
    #[serde(flatten)]
    pad: Pad,
    /// Readings per second.
    rate: u32,
}

/// Counts readings per second and sends at most one frame per screen refresh.
struct Pace {
    count: u32,
    rate: u32,
    tick: Instant,
    sent: Instant,
}

impl Pace {
    fn new() -> Self {
        Pace { count: 0, rate: 0, tick: Instant::now(), sent: Instant::now() }
    }

    fn push(&mut self, app: &AppHandle, pad: Pad) {
        self.count += 1;
        if self.tick.elapsed() >= Duration::from_secs(1) {
            self.rate = self.count;
            self.count = 0;
            self.tick = Instant::now();
        }
        if self.sent.elapsed() >= Duration::from_millis(14) {
            let _ = app.emit("pad", Frame { pad, rate: self.rate });
            self.sent = Instant::now();
        }
    }
}

fn feature(dev: &HidDevice, id: u8) -> Option<Vec<u8>> {
    let mut buf = [0u8; 80];
    buf[0] = id;
    let n = dev.get_feature_report(&mut buf).ok()?;
    Some(buf[..n].to_vec())
}

fn sony(d: &DeviceInfo) -> Option<Kind> {
    if d.vendor_id() != dualsense::VENDOR {
        return None;
    }
    if dualsense::PRODUCTS.contains(&d.product_id()) {
        Some(Kind::DualSense)
    } else if ds4::PRODUCTS.contains(&d.product_id()) {
        Some(Kind::DualShock4)
    } else {
        None
    }
}

/// Reads a PlayStation controller until it goes away.
fn run_hid(app: &AppHandle, api: &HidApi, found: &DeviceInfo, kind: Kind) {
    let Ok(dev) = found.open_device(api) else { return };
    let shared = app.state::<Shared>();
    let bluetooth = matches!(found.bus_type(), BusType::Bluetooth);
    let name = found.product_string().unwrap_or("Wireless Controller");
    let mut info = Info::new(kind, name, bluetooth);
    // Reading the calibration report switches Bluetooth to the full report (battery, motion, touch).
    match kind {
        Kind::DualSense => {
            let _ = feature(&dev, 0x05);
            info.edge = found.product_id() == dualsense::EDGE;
            info.mac = feature(&dev, 0x09).and_then(|f| dualsense::mac(&f));
            if let Some(f) = feature(&dev, 0x20) {
                dualsense::firmware(&f, &mut info);
            }
        }
        _ => {
            let _ = feature(&dev, if bluetooth { ds4::CALIBRATION_BT } else { ds4::CALIBRATION_USB });
            if let Some(f) = feature(&dev, ds4::FIRMWARE) {
                ds4::firmware(&f, &mut info);
            }
        }
    }
    // Over Bluetooth, Windows gives the controller's address as its serial number.
    if info.mac.is_none() {
        info.mac = found.serial_number().filter(|s| s.len() >= 12).map(|s| s.to_uppercase());
    }
    announce(app, Some(info));
    *shared.writer.lock().unwrap() = found.open_device(api).ok().map(|dev| Writer::Hid { dev, kind, bluetooth });
    write(&shared, true);

    let mut buf = [0u8; 128];
    let mut pace = Pace::new();
    loop {
        match dev.read_timeout(&mut buf, 250) {
            Err(_) => break,
            Ok(0) => continue,
            Ok(n) => {
                let pad = if kind == Kind::DualSense { dualsense::parse(&buf[..n], bluetooth) } else { ds4::parse(&buf[..n], bluetooth) };
                if let Some(pad) = pad {
                    pace.push(app, pad);
                }
            }
        }
    }
}

#[cfg(windows)]
fn run_xbox(app: &AppHandle, g: windows::Gaming::Input::Gamepad) {
    let shared = app.state::<Shared>();
    // Windows doesn't say how the controller is connected; a wired one has no battery report.
    let bluetooth = xbox::read(&g).is_some_and(|p| p.battery.is_some());
    announce(app, Some(Info::new(Kind::Xbox, "Controle Xbox", bluetooth)));
    *shared.writer.lock().unwrap() = Some(Writer::Xbox(g.clone()));
    write(&shared, false);
    let mut pace = Pace::new();
    let mut checked = Instant::now();
    loop {
        if checked.elapsed() >= Duration::from_secs(1) {
            if !xbox::present(&g) {
                break;
            }
            checked = Instant::now();
        }
        match xbox::read(&g) {
            Some(pad) => pace.push(app, pad),
            None => break,
        }
        sleep(Duration::from_millis(4));
    }
}

/// Looks for a controller, reads it until it goes away, then looks again. Runs for the app's life.
fn reader(app: AppHandle) {
    #[cfg(windows)]
    unsafe {
        // Windows.Gaming.Input is a WinRT API: this thread needs the runtime.
        let _ = windows::Win32::System::WinRT::RoInitialize(windows::Win32::System::WinRT::RO_INIT_MULTITHREADED);
    }
    let mut api = match HidApi::new() {
        Ok(api) => api,
        Err(e) => {
            let _ = app.emit("pad-error", e.to_string());
            return;
        }
    };
    loop {
        let _ = api.refresh_devices();
        let found = api.device_list().find_map(|d| sony(d).map(|k| (d.clone(), k)));
        if let Some((d, kind)) = found {
            run_hid(&app, &api, &d, kind);
        } else {
            #[cfg(windows)]
            if let Some(g) = xbox::first() {
                run_xbox(&app, g);
            }
        }
        *app.state::<Shared>().writer.lock().unwrap() = None;
        announce(&app, None);
        sleep(Duration::from_millis(700));
    }
}

pub fn run() {
    tauri::Builder::default()
        .manage(Shared::default())
        .setup(|app| {
            let handle = app.handle().clone();
            std::thread::spawn(move || reader(handle));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![set_output, hello])
        .build(tauri::generate_context!())
        .expect("PadLab não abriu")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                release(app);
            }
        });
}
