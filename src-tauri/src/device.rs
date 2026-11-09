//! What every controller turns into, whatever it is: the page only ever sees these types.

use serde::{Deserialize, Serialize};

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    DualSense,
    DualShock4,
    Xbox,
}

#[derive(Serialize, Clone, Copy, Default, Debug, PartialEq)]
pub struct Touch {
    pub down: bool,
    pub x: u16,
    pub y: u16,
}

/// One reading, already decoded. Sticks and triggers are 0..=255 with 128 at rest for the sticks
/// (down and right are high), and `buttons` is a bit mask in the order of BUTTONS in src/pad.ts,
/// named after the PlayStation layout (an Xbox A is Cross).
#[derive(Serialize, Clone, Default, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Pad {
    pub sticks: [u8; 4],
    pub l2: u8,
    pub r2: u8,
    pub buttons: u32,
    pub gyro: [i16; 3],
    pub accel: [i16; 3],
    pub touch: [Touch; 2],
    /// Percent. None until the controller says (the short Bluetooth report never does).
    pub battery: Option<u8>,
    /// 0 on battery, 1 charging, 2 full, 10+ errors.
    pub charge: Option<u8>,
    pub headphones: bool,
    pub mic: bool,
    pub full: bool,
}

/// What the page asks the controller to show and do. Each controller uses what it has.
#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Output {
    pub color: [u8; 3],
    /// Five bits, one per player LED (DualSense).
    pub players: u8,
    pub mic_led: bool,
    /// Left (heavy) and right (light) motor.
    pub rumble: [u8; 2],
    /// Raw adaptive-trigger effect (DualSense): mode byte and its parameters, up to 11 bytes.
    pub trigger_left: Vec<u8>,
    pub trigger_right: Vec<u8>,
    /// The motors inside the triggers (Xbox One and Series controllers), left and right.
    #[serde(default)]
    pub impulse: [u8; 2],
}

impl Default for Output {
    fn default() -> Self {
        Output {
            color: [0x4c, 0x8d, 0xff],
            players: 0b00100,
            mic_led: false,
            rumble: [0, 0],
            trigger_left: vec![0x05],
            trigger_right: vec![0x05],
            impulse: [0, 0],
        }
    }
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Info {
    pub kind: Kind,
    pub name: String,
    pub bluetooth: bool,
    pub edge: bool,
    pub mac: Option<String>,
    pub built: Option<String>,
    pub hardware: Option<String>,
    pub firmware: Option<String>,
    pub update: Option<String>,
}

impl Info {
    pub fn new(kind: Kind, name: impl Into<String>, bluetooth: bool) -> Self {
        Info { kind, name: name.into(), bluetooth, edge: false, mac: None, built: None, hardware: None, firmware: None, update: None }
    }
}
