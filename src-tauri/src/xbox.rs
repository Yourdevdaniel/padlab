//! Xbox controllers (One, Series, Elite) through Windows.Gaming.Input: the only Windows API that
//! reaches the motors inside the triggers and reads the battery. Readings are polled, not pushed.

use crate::device::{Output, Pad};
use windows::Gaming::Input::{Gamepad, GamepadButtons, GamepadReading, GamepadVibration};
use windows::System::Power::BatteryStatus;

/// The first gamepad Windows knows about. Windows fills the list a moment after start, so ask again
/// rather than trusting one empty answer.
pub fn first() -> Option<Gamepad> {
    let list = Gamepad::Gamepads().ok()?;
    if list.Size().ok()? == 0 {
        return None;
    }
    list.GetAt(0).ok()
}

/// Still plugged in and paired.
pub fn present(g: &Gamepad) -> bool {
    let Ok(list) = Gamepad::Gamepads() else { return false };
    let n = list.Size().unwrap_or(0);
    (0..n).filter_map(|i| list.GetAt(i).ok()).any(|x| &x == g)
}

const MAP: [(GamepadButtons, usize); 14] = [
    (GamepadButtons::A, 0),
    (GamepadButtons::B, 1),
    (GamepadButtons::X, 2),
    (GamepadButtons::Y, 3),
    (GamepadButtons::DPadUp, 4),
    (GamepadButtons::DPadDown, 5),
    (GamepadButtons::DPadLeft, 6),
    (GamepadButtons::DPadRight, 7),
    (GamepadButtons::LeftShoulder, 8),
    (GamepadButtons::RightShoulder, 9),
    (GamepadButtons::LeftThumbstick, 12),
    (GamepadButtons::RightThumbstick, 13),
    (GamepadButtons::View, 14),
    (GamepadButtons::Menu, 15),
];

fn axis(v: f64, invert: bool) -> u8 {
    let v = if invert { -v } else { v };
    ((v.clamp(-1.0, 1.0) + 1.0) * 127.5).round() as u8
}

/// A reading in the same shape as the PlayStation controllers'. Analog triggers also set the L2/R2
/// bits once they're a bit past their rest, as a DualSense does.
pub fn to_pad(r: &GamepadReading) -> Pad {
    let mut buttons = MAP.iter().fold(0u32, |m, (b, i)| if r.Buttons.0 & b.0 != 0 { m | 1 << i } else { m });
    if r.LeftTrigger > 0.1 {
        buttons |= 1 << 10;
    }
    if r.RightTrigger > 0.1 {
        buttons |= 1 << 11;
    }
    Pad {
        // Windows puts up at +1; the HID controllers put it at 0.
        sticks: [axis(r.LeftThumbstickX, false), axis(r.LeftThumbstickY, true), axis(r.RightThumbstickX, false), axis(r.RightThumbstickY, true)],
        l2: (r.LeftTrigger.clamp(0.0, 1.0) * 255.0).round() as u8,
        r2: (r.RightTrigger.clamp(0.0, 1.0) * 255.0).round() as u8,
        buttons,
        full: true,
        ..Default::default()
    }
}

pub fn read(g: &Gamepad) -> Option<Pad> {
    let mut pad = to_pad(&g.GetCurrentReading().ok()?);
    if let Some((battery, charge)) = battery(g) {
        pad.battery = Some(battery);
        pad.charge = Some(charge);
    }
    Some(pad)
}

/// Percent and charge state, when the controller reports them (a wired controller has no battery).
fn battery(g: &Gamepad) -> Option<(u8, u8)> {
    let report = g.TryGetBatteryReport().ok()?;
    let status = report.Status().ok()?;
    if status == BatteryStatus::NotPresent {
        return None;
    }
    let now = report.RemainingCapacityInMilliwattHours().ok()?.Value().ok()? as f64;
    let full = report.FullChargeCapacityInMilliwattHours().ok()?.Value().ok()? as f64;
    let pct = if full > 0.0 { (now / full * 100.0).round().clamp(0.0, 100.0) as u8 } else { 0 };
    let charge = if status == BatteryStatus::Charging { 1 } else if status == BatteryStatus::Idle && pct >= 99 { 2 } else { 0 };
    Some((pct, charge))
}

pub fn vibrate(g: &Gamepad, o: &Output) {
    let f = |v: u8| v as f64 / 255.0;
    let _ = g.SetVibration(GamepadVibration { LeftMotor: f(o.rumble[0]), RightMotor: f(o.rumble[1]), LeftTrigger: f(o.impulse[0]), RightTrigger: f(o.impulse[1]) });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_a_reading_to_the_playstation_layout() {
        let r = GamepadReading {
            Buttons: GamepadButtons(GamepadButtons::A.0 | GamepadButtons::DPadRight.0 | GamepadButtons::Menu.0),
            LeftTrigger: 0.0,
            RightTrigger: 1.0,
            LeftThumbstickX: -1.0,
            LeftThumbstickY: 1.0,
            RightThumbstickX: 0.0,
            RightThumbstickY: -1.0,
            ..Default::default()
        };
        let p = to_pad(&r);
        assert_eq!(p.buttons, 1 << 0 | 1 << 7 | 1 << 11 | 1 << 15);
        assert_eq!(p.sticks, [0, 0, 128, 255]);
        assert_eq!((p.l2, p.r2), (0, 255));
    }
}
