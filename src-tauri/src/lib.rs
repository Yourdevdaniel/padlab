mod dualsense;

use dualsense::{firmware, mac, output_report, parse, Info, Output, Pad, EDGE, PRODUCTS, VENDOR};
use hidapi::{BusType, HidApi, HidDevice};
use serde::Serialize;
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::Mutex;
use std::thread::sleep;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};

/// The handle used to write to the controller. Reading has its own handle in the reader thread,
/// so a write never waits for a read.
#[derive(Default)]
struct Shared {
    writer: Mutex<Option<(HidDevice, bool)>>,
    output: Mutex<Output>,
    seq: AtomicU8,
    /// The controller found last, for a page that starts listening after it was found.
    info: Mutex<Option<Info>>,
}

fn announce(app: &AppHandle, info: Option<Info>) {
    let _ = app.emit("pad-info", &info);
    *app.state::<Shared>().info.lock().unwrap() = info;
}

fn write(shared: &Shared, setup: bool) {
    let out = shared.output.lock().unwrap().clone();
    if let Some((dev, bt)) = shared.writer.lock().unwrap().as_ref() {
        let seq = shared.seq.fetch_add(1, Ordering::Relaxed);
        let _ = dev.write(&output_report(&out, *bt, setup, seq));
    }
}

#[tauri::command]
fn set_output(output: Output, shared: State<Shared>) {
    *shared.output.lock().unwrap() = output;
    write(&shared, false);
}

#[derive(Serialize, Clone)]
struct Frame {
    #[serde(flatten)]
    pad: Pad,
    /// Input reports per second.
    rate: u32,
}

fn feature(dev: &HidDevice, id: u8) -> Option<Vec<u8>> {
    let mut buf = [0u8; 80];
    buf[0] = id;
    let n = dev.get_feature_report(&mut buf).ok()?;
    Some(buf[..n].to_vec())
}

/// Finds the controller, reads it until it goes away, then looks again. Runs for the app's whole life.
fn reader(app: AppHandle) {
    let mut api = match HidApi::new() {
        Ok(api) => api,
        Err(e) => {
            let _ = app.emit("pad-error", e.to_string());
            return;
        }
    };
    let shared = app.state::<Shared>();
    loop {
        let _ = api.refresh_devices();
        let found = api.device_list().find(|d| d.vendor_id() == VENDOR && PRODUCTS.contains(&d.product_id())).cloned();
        let Some(info) = found else {
            announce(&app, None);
            sleep(Duration::from_secs(1));
            continue;
        };
        let Ok(dev) = info.open_device(&api) else {
            sleep(Duration::from_secs(1));
            continue;
        };
        let bt = info.bus_type() == BusType::Bluetooth;
        // Reading the calibration report switches Bluetooth to the full report (battery, motion, touch).
        let _ = feature(&dev, 0x05);
        let mut details = Info {
            name: info.product_string().unwrap_or("DualSense").to_string(),
            bluetooth: bt,
            edge: info.product_id() == EDGE,
            ..Default::default()
        };
        details.mac = feature(&dev, 0x09).and_then(|f| mac(&f));
        if let Some(f) = feature(&dev, 0x20) {
            firmware(&f, &mut details);
        }
        announce(&app, Some(details));
        *shared.writer.lock().unwrap() = info.open_device(&api).ok().map(|w| (w, bt));
        write(&shared, true);

        let mut buf = [0u8; 128];
        let (mut count, mut rate) = (0u32, 0u32);
        let (mut tick, mut emitted) = (Instant::now(), Instant::now());
        loop {
            match dev.read_timeout(&mut buf, 250) {
                Err(_) => break,
                Ok(0) => continue,
                Ok(n) => {
                    let Some(pad) = parse(&buf[..n], bt) else { continue };
                    count += 1;
                    if tick.elapsed() >= Duration::from_secs(1) {
                        rate = count;
                        count = 0;
                        tick = Instant::now();
                    }
                    // The page draws at the screen's rate; more events than that are wasted.
                    if emitted.elapsed() >= Duration::from_millis(14) {
                        let _ = app.emit("pad", Frame { pad, rate });
                        emitted = Instant::now();
                    }
                }
            }
        }
        *shared.writer.lock().unwrap() = None;
        announce(&app, None);
        sleep(Duration::from_millis(500));
    }
}

/// The page asks once it listens, so a controller found before that isn't missed.
#[tauri::command]
fn hello(shared: State<Shared>) -> Option<Info> {
    shared.info.lock().unwrap().clone()
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
        .run(tauri::generate_context!())
        .expect("PadLab não abriu");
}
