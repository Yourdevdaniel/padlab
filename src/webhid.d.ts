// The part of WebHID that src/web.ts uses (TypeScript's DOM types don't have it yet).
interface HIDReportInfo { reportId: number }
interface HIDCollectionInfo { inputReports?: HIDReportInfo[] }
interface HIDInputReportEvent extends Event { device: HIDDevice; reportId: number; data: DataView }
interface HIDDevice {
  opened: boolean
  vendorId: number
  productId: number
  productName: string
  collections: HIDCollectionInfo[]
  oninputreport: ((e: HIDInputReportEvent) => void) | null
  open(): Promise<void>
  sendReport(reportId: number, data: BufferSource): Promise<void>
  receiveFeatureReport(reportId: number): Promise<DataView>
}
interface HIDConnectionEvent extends Event { device: HIDDevice }
interface HID extends EventTarget {
  getDevices(): Promise<HIDDevice[]>
  requestDevice(options: { filters: { vendorId?: number; productId?: number }[] }): Promise<HIDDevice[]>
  addEventListener(type: 'connect' | 'disconnect', listener: (e: HIDConnectionEvent) => void): void
}
interface Navigator { readonly hid: HID }
