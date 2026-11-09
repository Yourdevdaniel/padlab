//! Battery of Bluetooth devices (mice, keyboards, headsets), the same number Windows shows in
//! Settings. Windows keeps it on the device node as DEVPKEY_Bluetooth_Battery. 2.4 GHz dongles have
//! no standard for it: each brand speaks its own protocol, so they don't show up here.
use serde::Serialize;

#[derive(Serialize, Debug, PartialEq)]
pub struct Battery {
    pub name: String,
    pub percent: u8,
}

/// Connected Bluetooth devices that report a battery level.
#[cfg(windows)]
pub fn list() -> Vec<Battery> {
    win::list()
}

#[cfg(not(windows))]
pub fn list() -> Vec<Battery> {
    Vec::new()
}

/// A device property string: UTF-16, little endian, ending in a NUL.
fn utf16(bytes: &[u8]) -> String {
    let units: Vec<u16> = bytes.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
    String::from_utf16_lossy(&units).trim_end_matches('\0').to_string()
}

#[cfg(windows)]
mod win {
    use super::{utf16, Battery};
    use windows::core::{GUID, PCWSTR};
    use windows::Win32::Devices::DeviceAndDriverInstallation::{
        SetupDiDestroyDeviceInfoList, SetupDiEnumDeviceInfo, SetupDiGetClassDevsW, SetupDiGetDevicePropertyW, DIGCF_PRESENT, HDEVINFO, SP_DEVINFO_DATA,
    };
    use windows::Win32::Devices::Properties::DEVPROPTYPE;
    use windows::Win32::Foundation::DEVPROPKEY;

    const BLUETOOTH_CLASS: GUID = GUID::from_u128(0xe0cbf06c_cd8b_4647_bb8a_263b43f0f974);
    const BATTERY: DEVPROPKEY = DEVPROPKEY { fmtid: GUID::from_u128(0x104ea319_6ee2_4701_bd47_8ddbf425bbe5), pid: 2 };
    /// A paired device stays "present" while off; this one says whether it is connected now.
    const CONNECTED: DEVPROPKEY = DEVPROPKEY { fmtid: GUID::from_u128(0x83da6326_97a6_4088_9453_a1923f573b29), pid: 15 };
    const FRIENDLY_NAME: DEVPROPKEY = DEVPROPKEY { fmtid: GUID::from_u128(0xa45c254e_df1c_4efd_8020_67d146a850e0), pid: 14 };

    fn property(set: HDEVINFO, dev: &SP_DEVINFO_DATA, key: &DEVPROPKEY) -> Option<Vec<u8>> {
        let mut kind = DEVPROPTYPE::default();
        let mut buf = vec![0u8; 512];
        let mut size = 0u32;
        unsafe { SetupDiGetDevicePropertyW(set, dev, key, &mut kind, Some(&mut buf), Some(&mut size as *mut u32), 0) }.ok()?;
        buf.truncate(size as usize);
        Some(buf)
    }

    pub fn list() -> Vec<Battery> {
        let mut found = Vec::new();
        let Ok(set) = (unsafe { SetupDiGetClassDevsW(Some(&BLUETOOTH_CLASS as *const GUID), PCWSTR::null(), None, DIGCF_PRESENT) }) else {
            return found;
        };
        let mut dev = SP_DEVINFO_DATA { cbSize: std::mem::size_of::<SP_DEVINFO_DATA>() as u32, ..Default::default() };
        let mut i = 0;
        while unsafe { SetupDiEnumDeviceInfo(set, i, &mut dev) }.is_ok() {
            i += 1;
            let Some(&[percent]) = property(set, &dev, &BATTERY).as_deref() else { continue };
            // DEVPROP_BOOLEAN: 0 is false. Without the property, assume connected.
            if property(set, &dev, &CONNECTED).is_some_and(|v| v.first() == Some(&0)) {
                continue;
            }
            let name = property(set, &dev, &FRIENDLY_NAME).map(|b| utf16(&b)).filter(|n| !n.is_empty());
            found.push(Battery { name: name.unwrap_or_else(|| "Dispositivo Bluetooth".into()), percent: percent.min(100) });
        }
        unsafe {
            let _ = SetupDiDestroyDeviceInfoList(set);
        }
        found
    }
}

#[cfg(test)]
mod tests {
    use super::utf16;

    #[test]
    fn name_drops_the_trailing_nul() {
        let bytes: Vec<u8> = "X11 Mouse\0".encode_utf16().flat_map(|u| u.to_le_bytes()).collect();
        assert_eq!(utf16(&bytes), "X11 Mouse");
    }

    #[test]
    fn name_keeps_accents() {
        let bytes: Vec<u8> = "Teclado Ação\0".encode_utf16().flat_map(|u| u.to_le_bytes()).collect();
        assert_eq!(utf16(&bytes), "Teclado Ação");
    }
}
