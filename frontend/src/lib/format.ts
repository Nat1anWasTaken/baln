export const formatTwd = (minor: number) => new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(minor)
export const formatTaipei = (value: string) => new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
export function localDate(date = new Date()) { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei' }).format(date) }
export function monthRange(month: string) { const [year, number] = month.split('-').map(Number); const start = `${month}-01`; const end = new Date(Date.UTC(year, number, 1)).toISOString().slice(0,10); return { start, end } }
