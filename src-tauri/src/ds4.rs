//! The DualShock 4 (PS4): its reports are close to the DualSense's, one generation older.
//! Offsets follow the Linux hid-playstation driver.

use crate::device::{Info, Output, Pad, Touch};
use crate::dualsense::{buttons, crc32};

/// First model, second model (CUH-ZCT2), and Sony's wireless USB adapter.
pub const PRODUCTS: [u16; 3] = [0x05c4, 0x09cc, 0x0ba0];

/// Feature report that, once read, makes Bluetooth send the full report (USB doesn't need it).
pub const CALIBRATION_BT: u8 = 0x05;
pub const CALIBRATION_USB: u8 = 0x02;
pub const FIRMWARE: u8 = 0xa3;

/// `report` starts with the report id, as hidapi returns it.
pub fn parse(report: &[u8], bluetooth: bool) -> Option<Pad> {
    match (*report.first()?, bluetooth) {
        (0x01, false) => full(report.get(1..)?),
        (0x11, _) => full(report.get(3..)?),
        (0x01, true) => short(report.get(1..)?),
        _ => None,
    }
}

fn short(d: &[u8]) -> Option<Pad> {
    if d.len() < 9 {
        return None;
    }
    Some(Pad { sticks: [d[0], d[1], d[2], d[3]], l2: d[7], r2: d[8], buttons: buttons(d[4], d[5], d[6] & 0x03), ..Default::default() })
}

fn full(d: &[u8]) -> Option<Pad> {
    if d.len() < 42 {
        return None;
    }
    let i16at = |i: usize| i16::from_le_bytes([d[i], d[i + 1]]);
    let touch = |i: usize| Touch {
        down: d[i] & 0x80 == 0,
        x: d[i + 1] as u16 | ((d[i + 2] as u16 & 0x0f) << 8),
        y: (d[i + 2] as u16 >> 4) | ((d[i + 3] as u16) << 4),
    };
    let status = d[29];
    let level = status & 0x0f;
    let cable = status & 0x10 != 0;
    // On the cable, 0..=9 means charging and 10/11 full; on battery, 0..=10 is the level itself.
    let (battery, charge) = match (cable, level) {
        (true, 0..=9) => ((level * 10 + 5).min(100), 1),
        (true, 10 | 11) => (100, 2),
        (true, _) => (0, 15),
        (false, _) => ((level * 10 + 5).min(100), 0),
    };
    Some(Pad {
        sticks: [d[0], d[1], d[2], d[3]],
        l2: d[7],
        r2: d[8],
        // The top bits of the third byte are a frame counter, not buttons.
        buttons: buttons(d[4], d[5], d[6] & 0x03),
        gyro: [i16at(12), i16at(14), i16at(16)],
        accel: [i16at(18), i16at(20), i16at(22)],
        // Touch reports start at 33 (32 says how many); the first one's points follow its timestamp.
        touch: [touch(34), touch(38)],
        battery: Some(battery),
        charge: Some(charge),
        headphones: status & 0x20 != 0,
        mic: status & 0x40 != 0,
        full: true,
    })
}

/// The output report, id first. The DS4 has a lightbar and two motors, nothing else.
pub fn output_report(o: &Output, bluetooth: bool) -> Vec<u8> {
    let mut common = [0u8; 11];
    common[0] = 0x01 | 0x02; // motors, lightbar
    common[3] = o.rumble[1];
    common[4] = o.rumble[0];
    common[5..8].copy_from_slice(&o.color);
    if !bluetooth {
        let mut r = vec![0u8; 32];
        r[0] = 0x05;
        r[1..12].copy_from_slice(&common);
        return r;
    }
    let mut r = vec![0u8; 78];
    r[0] = 0x11;
    r[1] = 0xc0; // HID report with a CRC
    r[3..14].copy_from_slice(&common);
    let mut seeded = vec![0xa2];
    seeded.extend_from_slice(&r[..74]);
    r[74..78].copy_from_slice(&crc32(&seeded).to_le_bytes());
    r
}

/// Feature report 0xa3, id first: build date and versions.
pub fn firmware(f: &[u8], info: &mut Info) {
    if f.len() < 45 {
        return;
    }
    let text = |a: usize, b: usize| String::from_utf8_lossy(&f[a..b]).trim_matches(char::from(0)).trim().to_string();
    info.built = Some(format!("{} {}", text(1, 17), text(17, 33)));
    info.hardware = Some(format!("0x{:04x}", u16::from_le_bytes([f[35], f[36]])));
    info.firmware = Some(format!("0x{:04x}", u16::from_le_bytes([f[41], f[42]])));
}

#[cfg(test)]
mod tests {
    use super::*;

    fn usb() -> [u8; 64] {
        let mut r = [0u8; 64];
        r[0] = 0x01;
        r[1..5].copy_from_slice(&[0, 128, 128, 255]);
        r[5] = 0x80 | 0x06; // Triangle, d-pad left
        r[6] = 0x10; // Share
        r[7] = 0x01 | 0xfc; // PS, plus counter bits that must be ignored
        r[9] = 90; // R2
        r[30] = 0x10 | 0x05; // on the cable, charging, 55%
        r[35] = 0x05; // finger 1 down
        r[36] = 0x10;
        r[37] = 0x02;
        r[38] = 0x03;
        r[39] = 0x80; // finger 2 up
        r
    }

    #[test]
    fn reads_a_usb_report() {
        let p = parse(&usb(), false).unwrap();
        assert_eq!(p.sticks, [0, 128, 128, 255]);
        assert_eq!(p.r2, 90);
        assert_eq!(p.buttons, 1 << 3 | 1 << 6 | 1 << 14 | 1 << 16);
        assert_eq!((p.battery, p.charge), (Some(55), Some(1)));
        assert_eq!(p.touch[0], Touch { down: true, x: 0x210, y: 0x030 });
        assert!(!p.touch[1].down);
    }

    #[test]
    fn reads_bluetooth_two_bytes_later() {
        let u = usb();
        let mut bt = [0u8; 78];
        bt[0] = 0x11;
        bt[3..66].copy_from_slice(&u[1..64]);
        assert_eq!(parse(&bt, true), parse(&u, false));
    }

    #[test]
    fn battery_off_the_cable_is_the_level() {
        let mut u = usb();
        u[30] = 0x08;
        let p = parse(&u, false).unwrap();
        assert_eq!((p.battery, p.charge), (Some(85), Some(0)));
    }

    #[test]
    fn output_sizes_and_crc() {
        let o = Output { rumble: [200, 50], ..Default::default() };
        let usb = output_report(&o, false);
        assert_eq!((usb.len(), usb[0], usb[4], usb[5]), (32, 0x05, 50, 200));
        let bt = output_report(&o, true);
        assert_eq!(bt.len(), 78);
        let mut seeded = vec![0xa2];
        seeded.extend_from_slice(&bt[..74]);
        assert_eq!(&bt[74..], &crc32(&seeded).to_le_bytes());
    }
}
