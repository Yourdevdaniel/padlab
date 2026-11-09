//! The DualSense's HID reports: reading the input report, building the output report.
//! Offsets follow the Linux hid-playstation driver. Pure functions, tested at the bottom.

use crate::device::{Info, Output, Pad, Touch};

pub const VENDOR: u16 = 0x054c;
/// DualSense and DualSense Edge.
pub const PRODUCTS: [u16; 2] = [0x0ce6, 0x0df2];
pub const EDGE: u16 = 0x0df2;

/// Shared with the DualShock 4, whose first three button bytes are laid out the same way.
pub(crate) fn buttons(b0: u8, b1: u8, b2: u8) -> u32 {
    let hat = b0 & 0x0f;
    let on = [
        b0 & 0x20 != 0,            // Cross
        b0 & 0x40 != 0,            // Circle
        b0 & 0x10 != 0,            // Square
        b0 & 0x80 != 0,            // Triangle
        matches!(hat, 7 | 0 | 1),  // Up
        matches!(hat, 3 | 4 | 5),  // Down
        matches!(hat, 5 | 6 | 7),  // Left
        matches!(hat, 1 | 2 | 3),  // Right
        b1 & 0x01 != 0,            // L1
        b1 & 0x02 != 0,            // R1
        b1 & 0x04 != 0,            // L2
        b1 & 0x08 != 0,            // R2
        b1 & 0x40 != 0,            // L3
        b1 & 0x80 != 0,            // R3
        b1 & 0x10 != 0,            // Create
        b1 & 0x20 != 0,            // Options
        b2 & 0x01 != 0,            // PS
        b2 & 0x02 != 0,            // Touchpad
        b2 & 0x04 != 0,            // Mute
    ];
    on.iter().enumerate().fold(0, |m, (i, &b)| if b { m | 1 << i } else { m })
}

/// `report` starts with the report id, as hidapi returns it.
pub fn parse(report: &[u8], bluetooth: bool) -> Option<Pad> {
    match (*report.first()?, bluetooth) {
        (0x01, false) => full(report.get(1..)?),
        (0x31, _) => full(report.get(2..)?),
        (0x01, true) => short(report.get(1..)?),
        _ => None,
    }
}

/// What Bluetooth sends until the calibration feature report is read.
fn short(d: &[u8]) -> Option<Pad> {
    if d.len() < 9 {
        return None;
    }
    Some(Pad { sticks: [d[0], d[1], d[2], d[3]], l2: d[7], r2: d[8], buttons: buttons(d[4], d[5], d[6] & 0x03), ..Default::default() })
}

fn full(d: &[u8]) -> Option<Pad> {
    if d.len() < 54 {
        return None;
    }
    let i16at = |i: usize| i16::from_le_bytes([d[i], d[i + 1]]);
    let touch = |i: usize| Touch {
        down: d[i] & 0x80 == 0,
        x: d[i + 1] as u16 | ((d[i + 2] as u16 & 0x0f) << 8),
        y: (d[i + 2] as u16 >> 4) | ((d[i + 3] as u16) << 4),
    };
    let status = d[52];
    Some(Pad {
        sticks: [d[0], d[1], d[2], d[3]],
        l2: d[4],
        r2: d[5],
        buttons: buttons(d[7], d[8], d[9]),
        gyro: [i16at(15), i16at(17), i16at(19)],
        accel: [i16at(21), i16at(23), i16at(25)],
        touch: [touch(32), touch(36)],
        battery: Some(((status & 0x0f) * 10 + 5).min(100)),
        charge: Some(status >> 4),
        headphones: d[53] & 0x01 != 0,
        mic: d[53] & 0x02 != 0,
        full: true,
    })
}

/// The 47-byte block shared by the USB and Bluetooth output reports.
fn common(o: &Output, setup: bool) -> [u8; 47] {
    let mut c = [0u8; 47];
    c[0] = 0x01 | 0x02 | 0x04 | 0x08; // vibration, haptics select, right and left trigger effects
    c[1] = 0x01 | 0x04 | 0x10; // mic LED, lightbar, player LEDs
    c[2] = o.rumble[1];
    c[3] = o.rumble[0];
    c[8] = o.mic_led as u8;
    let r = o.trigger_right.len().min(11);
    c[10..10 + r].copy_from_slice(&o.trigger_right[..r]);
    let l = o.trigger_left.len().min(11);
    c[21..21 + l].copy_from_slice(&o.trigger_left[..l]);
    if setup {
        // Ends the blue pairing glow, otherwise the chosen colour never shows.
        c[38] = 0x02;
        c[41] = 0x02;
    }
    c[43] = (o.players & 0x1f) | 0x20;
    c[44..47].copy_from_slice(&o.color);
    c
}

/// The whole output report, report id first, ready for `HidDevice::write`.
pub fn output_report(o: &Output, bluetooth: bool, setup: bool, seq: u8) -> Vec<u8> {
    let c = common(o, setup);
    if !bluetooth {
        let mut r = vec![0x02];
        r.extend_from_slice(&c);
        return r;
    }
    let mut r = vec![0u8; 78];
    r[0] = 0x31;
    r[1] = (seq & 0x0f) << 4;
    r[2] = 0x10;
    r[3..50].copy_from_slice(&c);
    // Bluetooth reports carry a CRC32 over a 0xA2 seed byte and the report.
    let mut seeded = vec![0xa2];
    seeded.extend_from_slice(&r[..74]);
    r[74..78].copy_from_slice(&crc32(&seeded).to_le_bytes());
    r
}

pub fn crc32(data: &[u8]) -> u32 {
    let mut c = !0u32;
    for &b in data {
        c ^= b as u32;
        for _ in 0..8 {
            c = if c & 1 != 0 { 0xedb8_8320 ^ (c >> 1) } else { c >> 1 };
        }
    }
    !c
}

/// Feature report 0x09, id first: the controller's address, last byte first.
pub fn mac(f: &[u8]) -> Option<String> {
    let b = f.get(1..7)?;
    Some(b.iter().rev().map(|x| format!("{x:02X}")).collect::<Vec<_>>().join(":"))
}

/// Feature report 0x20, id first: build date, hardware and firmware versions.
pub fn firmware(f: &[u8], info: &mut Info) {
    if f.len() < 46 {
        return;
    }
    let text = |a: usize, b: usize| String::from_utf8_lossy(&f[a..b]).trim_matches(char::from(0)).trim().to_string();
    let u32at = |i: usize| u32::from_le_bytes([f[i], f[i + 1], f[i + 2], f[i + 3]]);
    info.built = Some(format!("{} {}", text(1, 12), text(12, 20)));
    info.hardware = Some(format!("0x{:08x}", u32at(24)));
    info.firmware = Some(format!("0x{:08x}", u32at(28)));
    info.update = Some(format!("0x{:04x}", u16::from_le_bytes([f[44], f[45]])));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn crc_matches_the_standard_check_value() {
        assert_eq!(crc32(b"123456789"), 0xcbf4_3926);
    }

    #[test]
    fn reads_a_usb_report() {
        let mut r = [0u8; 64];
        r[0] = 0x01;
        r[1..5].copy_from_slice(&[128, 0, 255, 128]);
        r[5] = 200; // L2
        r[8] = 0x20 | 0x02; // Cross, d-pad right
        r[9] = 0x40; // L3
        r[10] = 0x01; // PS
        r[33] = 0x80; // finger 1 up
        r[37] = 0x01; // finger 2 down
        r[38] = 0x80;
        r[39] = 0x07;
        r[40] = 0x10;
        r[53] = 0x17; // 75%, charging
        let p = parse(&r, false).unwrap();
        assert_eq!(p.sticks, [128, 0, 255, 128]);
        assert_eq!(p.l2, 200);
        assert_eq!(p.buttons, 1 << 0 | 1 << 7 | 1 << 12 | 1 << 16);
        assert_eq!(p.battery, Some(75));
        assert_eq!(p.charge, Some(1));
        assert!(!p.touch[0].down);
        assert_eq!(p.touch[1], Touch { down: true, x: 0x780, y: 0x100 });
    }

    #[test]
    fn reads_a_bluetooth_report_one_byte_later() {
        let mut usb = [0u8; 64];
        usb[0] = 0x01;
        usb[1] = 10;
        usb[53] = 0x2a; // full, 100%
        let mut bt = [0u8; 78];
        bt[0] = 0x31;
        bt[2..65].copy_from_slice(&usb[1..64]);
        assert_eq!(parse(&bt, true), parse(&usb, false));
        assert_eq!(parse(&bt, true).unwrap().battery, Some(100));
    }

    #[test]
    fn bluetooth_output_is_signed() {
        let r = output_report(&Output::default(), true, true, 3);
        assert_eq!(r.len(), 78);
        assert_eq!(r[1], 0x30);
        let mut seeded = vec![0xa2];
        seeded.extend_from_slice(&r[..74]);
        assert_eq!(&r[74..], &crc32(&seeded).to_le_bytes());
        assert_eq!(&r[3 + 44..3 + 47], &[0x4c, 0x8d, 0xff]);
        assert_eq!(output_report(&Output::default(), false, false, 0).len(), 48);
    }
}
