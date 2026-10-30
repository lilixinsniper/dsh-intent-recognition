/**
 * Excel (xlsx) import/export for intent catalogs, powered by exceljs.
 *
 * Column layout (first sheet, header row required):
 *   名称 name | 编码 code | 描述 description | 示例 examples (、或\n分隔)
 *   关键词 keywords | 黑名单 blacklist | 白名单 whitelist
 *   路由类型 route_type | 路由目标 route_target | 工作流脚本 route_script
 */
import ExcelJS from 'exceljs'
import type { IntentRoute, IntentRow } from './types.ts'

export const INTENT_HEADERS = ['名称', '编码', '描述', '示例', '关键词', '黑名单', '白名单', '路由类型', '路由目标', '工作流脚本'] as const

const splitList = (v: unknown): string[] => {
  if (v === null || v === undefined) return []
  return String(v)
    .split(/[\n、,，;；|]/)
    .map(s => s.trim())
    .filter(Boolean)
}

const cellText = (v: ExcelJS.CellValue): string => {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') {
    if ('richText' in v) return (v as ExcelJS.CellRichTextValue).richText.map(r => r.text).join('')
    if ('text' in v) return String((v as { text: unknown }).text)
    if ('result' in v) return String((v as { result: unknown }).result ?? '')
    return String(v)
  }
  return String(v)
}

export interface ImportedIntent {
  name: string
  code: string
  description: string
  examples: string[]
  keywords: string[]
  blacklist: string[]
  whitelist: string[]
  route: IntentRoute
}

function parseRoute(typeRaw: string, target: string, script: string): IntentRoute {
  const type = (['none', 'workflow', 'subagent', 'service'] as const).includes(typeRaw as never)
    ? (typeRaw as IntentRoute['type'])
    : target || script
      ? 'workflow'
      : 'none'
  return { type, target, ...(script ? { script } : {}) }
}

export async function parseIntentWorkbook(buffer: Buffer): Promise<ImportedIntent[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer)
  const sheet = wb.worksheets[0]
  if (!sheet) throw new Error('Excel 文件没有工作表')
  const header = sheet.getRow(1)
  const cols = new Map<string, number>()
  header.eachCell((cell, col) => {
    const t = cellText(cell.value).trim()
    if (t) cols.set(t, col)
  })
  const nameCol = cols.get('名称') ?? cols.get('name') ?? 1
  const codeCol = cols.get('编码') ?? cols.get('code') ?? 2
  const find = (zh: string, en: string): number | undefined => cols.get(zh) ?? cols.get(en)
  const rows: ImportedIntent[] = []
  sheet.eachRow((row, n) => {
    if (n === 1) return
    const name = cellText(row.getCell(nameCol).value).trim()
    const code = cellText(row.getCell(codeCol).value).trim()
    if (!name && !code) return
    if (!name || !code) throw new Error(`第 ${n} 行：名称和编码都不能为空`)
    const get = (col: number | undefined): string => (col === undefined ? '' : cellText(row.getCell(col).value).trim())
    rows.push({
      name,
      code,
      description: get(find('描述', 'description')),
      examples: splitList(get(find('示例', 'examples'))),
      keywords: splitList(get(find('关键词', 'keywords'))),
      blacklist: splitList(get(find('黑名单', 'blacklist'))),
      whitelist: splitList(get(find('白名单', 'whitelist'))),
      route: parseRoute(get(find('路由类型', 'route_type')), get(find('路由目标', 'route_target')), get(find('工作流脚本', 'route_script'))),
    })
  })
  if (rows.length === 0) throw new Error('Excel 文件中没有有效的意图行')
  return rows
}

export async function buildIntentWorkbook(scenarioName: string, intents: IntentRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const sheet = wb.addWorksheet('意图')
  sheet.columns = [
    { header: '名称', key: 'name', width: 20 },
    { header: '编码', key: 'code', width: 24 },
    { header: '描述', key: 'description', width: 40 },
    { header: '示例', key: 'examples', width: 50 },
    { header: '关键词', key: 'keywords', width: 30 },
    { header: '黑名单', key: 'blacklist', width: 20 },
    { header: '白名单', key: 'whitelist', width: 20 },
    { header: '路由类型', key: 'route_type', width: 12 },
    { header: '路由目标', key: 'route_target', width: 24 },
    { header: '工作流脚本', key: 'route_script', width: 60 },
  ]
  sheet.getRow(1).font = { bold: true }
  for (const i of intents) {
    sheet.addRow({
      name: i.name,
      code: i.code,
      description: i.description,
      examples: i.examples.join('\n'),
      keywords: i.keywords.join('、'),
      blacklist: i.blacklist.join('、'),
      whitelist: i.whitelist.join('、'),
      route_type: i.route?.type ?? 'none',
      route_target: i.route?.target ?? '',
      route_script: i.route?.script ?? '',
    })
  }
  sheet.eachRow(row => { row.alignment = { vertical: 'top', wrapText: true } })
  const out = await wb.xlsx.writeBuffer()
  return Buffer.from(out as ArrayBuffer)
}

export function intentTemplateFilename(scenarioName: string): string {
  return `intents-${scenarioName.replace(/[\\/:*?"<>|]/g, '_')}.xlsx`
}
