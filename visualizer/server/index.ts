import express from 'express'
import cors from 'cors'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join, resolve } from 'path'

const app = express()
app.use(cors())

const PROJECT_ROOT = resolve(import.meta.dirname, '../..')
const ASSETS = join(PROJECT_ROOT, 'assets')
const COCO_DIR = join(ASSETS, 'NM_NGD_coco_dataset/train')
const PRODUCT_DIR = join(ASSETS, 'NM_NGD_product_images')
const RUNS_DIR = join(PROJECT_ROOT, 'runs/train')

// Cache annotations in memory
let annotationsCache: string | null = null

app.get('/api/annotations', (_req, res) => {
  if (!annotationsCache) {
    try {
      annotationsCache = readFileSync(join(COCO_DIR, 'annotations.json'), 'utf-8')
    } catch {
      return res.status(404).json({ error: 'annotations.json not found' })
    }
  }
  res.type('json').send(annotationsCache)
})

app.get('/api/metadata', (_req, res) => {
  try {
    const data = readFileSync(join(PRODUCT_DIR, 'metadata.json'), 'utf-8')
    res.type('json').send(data)
  } catch {
    res.status(404).json({ error: 'metadata.json not found' })
  }
})

app.get('/api/images/shelf/:filename', (req, res) => {
  const filePath = join(COCO_DIR, 'images', req.params.filename)
  if (!existsSync(filePath)) return res.status(404).send('Not found')
  res.sendFile(filePath)
})

app.get('/api/images/product/:barcode/:view', (req, res) => {
  const { barcode, view } = req.params
  const filePath = join(PRODUCT_DIR, barcode, `${view}.jpg`)
  if (!existsSync(filePath)) return res.status(404).send('Not found')
  res.sendFile(filePath)
})

app.get('/api/runs', (_req, res) => {
  try {
    if (!existsSync(RUNS_DIR)) return res.json([])
    const dirs = readdirSync(RUNS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
    res.json(dirs)
  } catch {
    res.json([])
  }
})

app.get('/api/runs/:name/results', (req, res) => {
  const csvPath = join(RUNS_DIR, req.params.name, 'results.csv')
  if (!existsSync(csvPath)) return res.status(404).json({ error: 'results.csv not found' })

  const content = readFileSync(csvPath, 'utf-8')
  const lines = content.trim().split('\n')
  if (lines.length < 2) return res.json([])

  const headers = lines[0].split(',').map(h => h.trim())
  const rows = lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim())
    const obj: Record<string, number> = {}
    headers.forEach((h, i) => {
      obj[h] = parseFloat(vals[i]) || 0
    })
    return obj
  })
  res.json(rows)
})

app.get('/api/runs/:name/plots/:filename', (req, res) => {
  const filePath = join(RUNS_DIR, req.params.name, req.params.filename)
  if (!existsSync(filePath)) return res.status(404).send('Not found')
  res.sendFile(filePath)
})

app.get('/api/runs/:name/args', (req, res) => {
  const yamlPath = join(RUNS_DIR, req.params.name, 'args.yaml')
  if (!existsSync(yamlPath)) return res.status(404).json({ error: 'args.yaml not found' })

  // Simple YAML to JSON (key: value format)
  const content = readFileSync(yamlPath, 'utf-8')
  const obj: Record<string, string | number | boolean> = {}
  for (const line of content.split('\n')) {
    const match = line.match(/^(\w+):\s*(.*)$/)
    if (match) {
      const [, key, val] = match
      if (val === 'true') obj[key] = true
      else if (val === 'false') obj[key] = false
      else if (val === 'null' || val === 'None') obj[key] = 'None'
      else if (!isNaN(Number(val)) && val !== '') obj[key] = Number(val)
      else obj[key] = val
    }
  }
  res.json(obj)
})

const PORT = 3001
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`)
})
