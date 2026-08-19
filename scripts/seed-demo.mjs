#!/usr/bin/env node
/**
 * A year of demo trading data, for looking at the app with something in it.
 *
 * It goes through the public API rather than writing to Postgres directly, on
 * purpose: inventory levels, cost layers, customer dues, supplier dues and
 * account balances are all worked out by the service layer. Inserted straight
 * into the tables they would be whatever this script guessed, and the pages
 * would be showing figures the real code never produced - which is the
 * opposite of useful when the point is to spot what looks wrong.
 *
 *   Seed:  SEED_TOKEN=<access token> node scripts/seed-demo.mjs
 *   Undo:  SEED_TOKEN=<access token> node scripts/seed-demo.mjs --wipe
 *
 * Every id it creates is appended to scripts/seed-demo-ids.json as it goes, so
 * an interrupted run is still undoable. --wipe deletes them newest-first, which
 * is the order that respects the foreign keys.
 *
 * Optional:
 *   SEED_API=https://furnify.softech.agency/api/v1   (default)
 *   SEED_SCALE=1                                     (0.25 for a quick run)
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ID_FILE = path.join(HERE, 'seed-demo-ids.json')

const API = process.env.SEED_API || 'https://furnify.softech.agency/api/v1'
const TOKEN = process.env.SEED_TOKEN || ''
const WIPE = process.argv.includes('--wipe')
// A rehearsal: seed a couple of days' worth, report it, then remove it again.
// Worth running first - it exercises every payload shape this script sends, so
// a field the API does not like shows up in thirty seconds rather than ten
// minutes into the real run.
const CHECK = process.argv.includes('--check')
const SCALE = CHECK ? 0.02 : Number(process.env.SEED_SCALE || 1)

if (!TOKEN) {
  console.error('SEED_TOKEN is not set.\n\n  SEED_TOKEN=<access token> node scripts/seed-demo.mjs\n')
  process.exit(1)
}

// ---------------------------------------------------------------- plumbing

const created = fs.existsSync(ID_FILE) ? JSON.parse(fs.readFileSync(ID_FILE, 'utf8')) : []
let pending = 0

function remember(kind, id) {
  if (!id) return
  created.push({ kind, id })
  // Flushed every 25 so a crash loses at most a handful of ids, without
  // writing the file thousands of times.
  if (++pending >= 25) flush()
}

function flush() {
  fs.writeFileSync(ID_FILE, JSON.stringify(created, null, 0))
  pending = 0
}

async function call(method, endpoint, body) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    let response
    try {
      response = await fetch(API + endpoint, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch (error) {
      if (attempt === 4) throw new Error(`${method} ${endpoint}: ${error.message}`)
      await sleep(400 * attempt)
      continue
    }

    if (response.status === 401) throw new Error('The token was rejected (401). Log in again and use the new access token.')
    if (response.status === 429 || response.status >= 500) {
      if (attempt === 4) throw new Error(`${method} ${endpoint}: HTTP ${response.status}`)
      await sleep(600 * attempt)
      continue
    }

    const text = await response.text()
    let payload
    try { payload = JSON.parse(text) } catch { payload = null }
    if (!response.ok) {
      throw new Error(`${method} ${endpoint}: HTTP ${response.status} ${text.slice(0, 300)}`)
    }
    return payload?.data
  }
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

/** Runs jobs a few at a time - enough to be quick, not enough to bury the VPS. */
async function inBatches(items, worker, { concurrency = 6, label = '' } = {}) {
  const results = []
  let done = 0
  let index = 0
  async function run() {
    while (index < items.length) {
      const mine = index++
      results[mine] = await worker(items[mine], mine)
      done += 1
      if (label && (done % 25 === 0 || done === items.length)) {
        process.stdout.write(`\r   ${label}: ${done}/${items.length}   `)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run))
  if (label) process.stdout.write('\n')
  return results
}

// A fixed seed, so two runs produce the same business rather than a different
// one each time - it makes "did this figure change because of my edit?" a
// question you can actually answer.
let rngState = 20260819
function rnd() {
  rngState = (rngState * 1664525 + 1013904223) % 4294967296
  return rngState / 4294967296
}
const pick = (list) => list[Math.floor(rnd() * list.length)]
const between = (min, max) => min + Math.floor(rnd() * (max - min + 1))
const money = (min, max, step = 50) => Math.round(between(min, max) / step) * step
const chance = (probability) => rnd() < probability

/**
 * A stamp that makes this run's product codes, SI numbers and invoice numbers
 * different from any earlier run's.
 *
 * Deleting a product, a purchase or a sale is a soft delete - the row keeps its
 * `owner_id + code` unique key and only gets a `deleted_at`. So a code used
 * once is reserved for good, and re-seeding after a --wipe would collide on
 * every single one. The stamp sidesteps that; everything else about the run is
 * still deterministic.
 */
const STAMP = 100 + (Math.floor(Date.now() / 60000) % 900)

const iso = (date) => date.toISOString().slice(0, 10)
const addDays = (date, days) => { const next = new Date(date); next.setDate(next.getDate() + days); return next }

// ------------------------------------------------------------ the business

const TODAY = new Date('2026-08-19T00:00:00Z')
const START = new Date('2025-09-01T00:00:00Z')

const ACCOUNTS = [
  { name: 'Cash in Hand', type: 'cash', opening_balance: 250000, sort_order: 1 },
  { name: 'City Bank - Current', type: 'bank', opening_balance: 1800000, sort_order: 2 },
  { name: 'bKash Merchant', type: 'mfs', opening_balance: 120000, sort_order: 3 },
  { name: 'Nagad', type: 'mfs', opening_balance: 60000, sort_order: 4 },
]

const EXPENSE_CATEGORIES = [
  { name: 'Shop Rent', color: '#ef4444', monthly_budget: 85000 },
  { name: 'Staff Salary', color: '#3b82f6', monthly_budget: 240000 },
  { name: 'Electricity & Utilities', color: '#f59e0b', monthly_budget: 32000 },
  { name: 'Transport & Delivery', color: '#10b981', monthly_budget: 45000 },
  { name: 'Marketing', color: '#8b5cf6', monthly_budget: 30000 },
  { name: 'Repair & Maintenance', color: '#ec4899', monthly_budget: 18000 },
  { name: 'Office Supplies', color: '#14b8a6', monthly_budget: 9000 },
  { name: 'Miscellaneous', color: '#6b7280', monthly_budget: 12000 },
]

const SUPPLIERS = [
  { name: 'Hatil Complex Ltd', person: 'Kamrul Hasan', phone: '01711234501', address: 'Tongi, Gazipur' },
  { name: 'Otobi Furniture', person: 'Shahidul Islam', phone: '01711234502', address: 'Uttara, Dhaka' },
  { name: 'Partex Furniture', person: 'Nazmul Karim', phone: '01711234503', address: 'Savar, Dhaka' },
  { name: 'Akhtar Furnishers', person: 'Rezaul Haque', phone: '01711234504', address: 'Mirpur, Dhaka' },
  { name: 'Navana Furniture', person: 'Tanvir Ahmed', phone: '01711234505', address: 'Tejgaon, Dhaka' },
  { name: 'Regal Furniture', person: 'Mizanur Rahman', phone: '01711234506', address: 'Narayanganj' },
  { name: 'Brothers Furniture', person: 'Jahangir Alam', phone: '01711234507', address: 'Chattogram' },
  { name: 'Nadia Wood Works', person: 'Sabbir Hossain', phone: '01711234508', address: 'Keraniganj, Dhaka' },
]

const CATEGORIES = [
  { name: 'Sofa', low: 28000, high: 95000, imageWord: 'sofa' },
  { name: 'Bed', low: 32000, high: 120000, imageWord: 'bedroom' },
  { name: 'Wardrobe', low: 26000, high: 88000, imageWord: 'wardrobe' },
  { name: 'Dining Table', low: 24000, high: 110000, imageWord: 'dining' },
  { name: 'Chair', low: 4500, high: 22000, imageWord: 'chair' },
  { name: 'Office Desk', low: 12000, high: 46000, imageWord: 'desk' },
  { name: 'Cabinet', low: 9000, high: 38000, imageWord: 'cabinet' },
  { name: 'Mattress', low: 8000, high: 42000, imageWord: 'mattress' },
]

const MODEL_WORDS = ['Aurora', 'Bengal', 'Cascade', 'Delta', 'Eden', 'Fiora', 'Granite', 'Harmony', 'Ivory', 'Jasmine',
  'Kestrel', 'Lagoon', 'Maple', 'Nordic', 'Oakley', 'Prime', 'Quartz', 'Riviera', 'Sonata', 'Teak',
  'Umbra', 'Verona', 'Willow', 'Xenia', 'Yarra', 'Zephyr', 'Meghna', 'Padma', 'Jamuna', 'Surma']
const FINISHES = ['Walnut', 'Teak', 'Oak', 'Mahogany', 'White Gloss', 'Matte Black', 'Natural', 'Ash Grey']

const FIRST_NAMES = ['Abdul', 'Rafiq', 'Sultana', 'Nasrin', 'Kamal', 'Jasim', 'Rubel', 'Farhana', 'Shamim', 'Tahmina',
  'Imran', 'Sabina', 'Anwar', 'Mahbub', 'Rokeya', 'Salma', 'Nazrul', 'Delwar', 'Ruma', 'Faisal',
  'Habib', 'Shirin', 'Motaleb', 'Parvin', 'Bashir', 'Nusrat', 'Aminul', 'Rehana', 'Zahid', 'Munira']
const LAST_NAMES = ['Rahman', 'Hossain', 'Islam', 'Ahmed', 'Chowdhury', 'Khan', 'Sarker', 'Mia', 'Uddin', 'Akter',
  'Begum', 'Talukder', 'Bhuiyan', 'Molla', 'Sheikh', 'Mridha', 'Howlader', 'Patwary']
const AREAS = ['Dhanmondi, Dhaka', 'Gulshan, Dhaka', 'Mirpur, Dhaka', 'Uttara, Dhaka', 'Bashundhara, Dhaka',
  'Mohammadpur, Dhaka', 'Banani, Dhaka', 'Agrabad, Chattogram', 'Khulshi, Chattogram', 'Zindabazar, Sylhet',
  'Kotwali, Cumilla', 'Sadar, Noakhali', 'Boalia, Rajshahi', 'Sadar, Khulna', 'Sadar, Barishal']

const EMPLOYEES = [
  { name: 'Rafiqul Islam', role: 'Showroom Manager', salary: 42000 },
  { name: 'Shahin Alam', role: 'Sales Executive', salary: 26000 },
  { name: 'Momena Khatun', role: 'Sales Executive', salary: 25000 },
  { name: 'Jahid Hasan', role: 'Accountant', salary: 34000 },
  { name: 'Sumon Mia', role: 'Delivery In-charge', salary: 22000 },
  { name: 'Anisur Rahman', role: 'Carpenter', salary: 24000 },
  { name: 'Liton Das', role: 'Helper', salary: 16000 },
  { name: 'Parvez Hossain', role: 'Security', salary: 15000 },
]

const SHAREHOLDERS = [
  { name: 'Arifur Rahman', share_percentage: 50, opening_amount: 2500000, phone: '01612163711' },
  { name: 'Mahfuzur Rahman', share_percentage: 30, opening_amount: 1500000, phone: '01712163712' },
  { name: 'Nasima Rahman', share_percentage: 20, opening_amount: 1000000, phone: '01812163713' },
]

const LENDERS = [
  { name: 'City Bank SME Loan', lender_type: 'bank', phone: '09666716250', address: 'Gulshan Branch, Dhaka' },
  { name: 'Brac Bank Term Loan', lender_type: 'bank', phone: '09678016200', address: 'Banani Branch, Dhaka' },
  { name: 'Mostafa Kamal', lender_type: 'person', phone: '01911223344', address: 'Mirpur, Dhaka' },
  { name: 'Hasan Traders', lender_type: 'person', phone: '01811223355', address: 'Old Dhaka' },
]

// Furniture sells in bursts: the two Eids, and the winter wedding season.
function seasonFactor(date) {
  const month = date.getUTCMonth() + 1
  if (month === 3 || month === 4) return 1.6      // Ramadan / Eid-ul-Fitr
  if (month === 6) return 1.35                    // Eid-ul-Azha
  if (month === 12 || month === 1) return 1.4     // wedding season
  if (month === 7 || month === 8) return 0.8      // monsoon
  return 1
}

// ------------------------------------------------------------------- wipe

const WIPE_ORDER = [
  'profit_withdrawal', 'investment', 'loan', 'customer_payment', 'supplier_payment',
  'salary_transaction', 'other_income', 'expense', 'sale', 'purchase',
  'purchase_target', 'monthly_target', 'marketing_contact',
  'product', 'customer', 'employee', 'shareholder', 'loan_lender', 'supplier',
  'expense_category', 'account',
]

const DELETE_PATH = {
  account: (id) => `/accounts/${id}`,
  expense_category: (id) => `/expense-categories/${id}`,
  supplier: (id) => `/suppliers/${id}`,
  customer: (id) => `/customers/${id}`,
  product: (id) => `/products/${id}`,
  employee: (id) => `/employees/${id}`,
  shareholder: (id) => `/shareholders/${id}`,
  loan_lender: (id) => `/loan-lenders/${id}`,
  purchase: (id) => `/purchases/${id}`,
  sale: (id) => `/sales/${id}`,
  expense: (id) => `/expenses/${id}`,
  other_income: (id) => `/other-incomes/${id}`,
  supplier_payment: (id) => `/supplier-payments/${id}`,
  customer_payment: (id) => `/customer-payments/${id}`,
  salary_transaction: (id) => `/salary-transactions/${id}`,
  loan: (id) => `/loans/${id}`,
  investment: (id) => `/investments/${id}`,
  profit_withdrawal: (id) => `/profit-withdrawals/${id}`,
  monthly_target: (id) => `/monthly-targets/${id}`,
  purchase_target: (id) => `/purchase-targets/${id}`,
  marketing_contact: (id) => `/marketing-contacts/${id}`,
}

async function wipe() {
  if (created.length === 0) {
    console.log('Nothing recorded in seed-demo-ids.json - nothing to undo.')
    return
  }
  console.log(`Removing ${created.length} records this script created, newest kind first.\n`)
  let removed = 0
  let failed = 0
  for (const kind of WIPE_ORDER) {
    const ids = created.filter(row => row.kind === kind).map(row => row.id)
    if (ids.length === 0) continue
    await inBatches(ids, async (id) => {
      try {
        await call('DELETE', DELETE_PATH[kind](id))
        removed += 1
      } catch {
        // A row already gone, or one the API refuses to delete because
        // something still points at it. Counted, not fatal - the rest of the
        // wipe is still worth doing.
        failed += 1
      }
    }, { concurrency: 5, label: kind })
  }
  fs.writeFileSync(ID_FILE, JSON.stringify([], null, 0))
  console.log(`\nRemoved ${removed}. ${failed} could not be removed (already gone, or still referenced).`)
}

// ------------------------------------------------------------------- seed

async function seed() {
  const t0 = Date.now()
  console.log(`Seeding ${API}`)
  console.log(`A year of trading: ${iso(START)} to ${iso(TODAY)}\n`)

  // 1. Accounts -------------------------------------------------------------
  const accounts = await inBatches(ACCOUNTS, async (row) => {
    const account = await call('POST', '/accounts', { ...row, is_active: true })
    remember('account', account?.id)
    return account
  }, { label: 'accounts' })
  const cash = accounts[0]
  const bank = accounts[1]
  const payAccount = () => pick(accounts)

  // 2. Expense categories ---------------------------------------------------
  const categories = await inBatches(EXPENSE_CATEGORIES, async (row) => {
    const category = await call('POST', '/expense-categories', { ...row, is_active: true })
    remember('expense_category', category?.id)
    return category
  }, { label: 'expense categories' })
  const salaryCategory = categories.find(c => c.name === 'Staff Salary') || categories[0]

  // 3. Suppliers ------------------------------------------------------------
  const suppliers = await inBatches(SUPPLIERS, async (row) => {
    const supplier = await call('POST', '/suppliers', {
      name: row.name,
      company_name: row.name,
      person_name: row.person,
      phone: row.phone,
      address: row.address,
      email: `${row.name.split(' ')[0].toLowerCase()}@example.com`,
      due_type: 'purchase',
      opening_due: 0,
      is_active: true,
    })
    remember('supplier', supplier?.id)
    return supplier
  }, { label: 'suppliers' })

  // 4. Products -------------------------------------------------------------
  const productCount = Math.max(20, Math.round(110 * SCALE))
  const productPlans = Array.from({ length: productCount }, (_, i) => {
    const category = CATEGORIES[i % CATEGORIES.length]
    const supplier = suppliers[i % suppliers.length]
    const code = `${STAMP}${String(1001 + i)}`
    const selling = money(category.low, category.high, 500)
    // Bought for 62-74% of the shelf price - a furniture margin that leaves
    // room for the discounts the sales below hand out.
    const cost = Math.round(selling * (0.62 + rnd() * 0.12) / 100) * 100
    return {
      product_code: code,
      name: `${pick(MODEL_WORDS)} ${category.name} - ${pick(FINISHES)}`,
      category: category.name,
      supplier_id: supplier.id,
      // Real photographs, addressed by a stable seed so a product keeps its
      // picture between runs.
      image_url: `https://picsum.photos/seed/furnify-${category.imageWord}-${code}/640/480`,
      selling_price: selling,
      cost_price: cost,
      dp_discount: pick([0, 0, 2, 3, 5]),
      mrp_discount: pick([0, 0, 0, 5, 8, 10]),
      is_active: true,
    }
  })
  const products = await inBatches(productPlans, async (row) => {
    const product = await call('POST', '/products', row)
    remember('product', product?.id)
    return { ...row, id: product?.id }
  }, { label: 'products' })

  // 5. Customers ------------------------------------------------------------
  const customerCount = Math.max(10, Math.round(55 * SCALE))
  const customerPlans = Array.from({ length: customerCount }, (_, i) => ({
    name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
    phone: `018${String(10000000 + i * 137 + between(0, 99)).slice(0, 8)}`,
    email: chance(0.4) ? `customer${i + 1}@example.com` : undefined,
    address: pick(AREAS),
    opening_due: chance(0.15) ? money(5000, 60000, 500) : 0,
    is_active: true,
  }))
  const customers = await inBatches(customerPlans, async (row) => {
    const customer = await call('POST', '/customers', row)
    remember('customer', customer?.id)
    return { ...row, id: customer?.id }
  }, { label: 'customers' })

  // 6. Employees ------------------------------------------------------------
  const employees = await inBatches(EMPLOYEES, async (row, i) => {
    const employee = await call('POST', '/employees', {
      name: row.name,
      phone: `017${String(20000000 + i * 971).slice(0, 8)}`,
      address: pick(AREAS),
      join_date: iso(addDays(START, -between(30, 900))),
      notes: `${row.role} · monthly ${row.salary}`,
      is_active: i < EMPLOYEES.length - 1,
    })
    remember('employee', employee?.id)
    return { ...row, id: employee?.id }
  }, { label: 'employees' })

  // 7. Shareholders and their capital ---------------------------------------
  const shareholders = await inBatches(SHAREHOLDERS, async (row, i) => {
    const shareholder = await call('POST', '/shareholders', { ...row, address: pick(AREAS), sort_order: i + 1, is_active: true })
    remember('shareholder', shareholder?.id)
    return { ...row, id: shareholder?.id }
  }, { label: 'shareholders' })

  const investmentPlans = []
  for (const holder of shareholders) {
    for (let i = 0; i < between(2, 4); i += 1) {
      investmentPlans.push({
        date: iso(addDays(START, between(0, 350))),
        shareholder_id: holder.id,
        shareholder_name: holder.name,
        invest_amount: money(100000, 600000, 5000),
        withdraw_amount: 0,
        account_id: bank.id,
        account_name: bank.name,
        notes: 'Capital injection',
      })
    }
  }
  await inBatches(investmentPlans, async (row) => {
    const investment = await call('POST', '/investments', row)
    remember('investment', investment?.id)
  }, { label: 'investments' })

  // 8. Lenders and loan movements -------------------------------------------
  const lenders = await inBatches(LENDERS, async (row) => {
    const lender = await call('POST', '/loan-lenders', { ...row, opening_balance: 0, is_active: true })
    remember('loan_lender', lender?.id)
    return { ...row, id: lender?.id }
  }, { label: 'lenders' })

  const loanPlans = []
  for (const lender of lenders) {
    const taken = money(400000, 1500000, 10000)
    loanPlans.push({
      date: iso(addDays(START, between(0, 60))),
      lender_id: lender.id,
      lender_name: lender.name,
      loan_type: lender.lender_type === 'bank' ? 'bank' : 'personal',
      transaction_type: 'receive',
      received_amount: taken,
      payment_amount: 0,
      interest_amount: 0,
      account_id: bank.id,
      account_name: bank.name,
      notes: 'Loan received',
    })
    // Paid back in instalments over the year, never more than was taken.
    const instalments = between(4, 8)
    for (let i = 1; i <= instalments; i += 1) {
      loanPlans.push({
        date: iso(addDays(START, 60 + i * between(30, 45))),
        lender_id: lender.id,
        lender_name: lender.name,
        loan_type: lender.lender_type === 'bank' ? 'bank' : 'personal',
        transaction_type: 'payment',
        received_amount: 0,
        payment_amount: Math.round(taken / instalments / 1000) * 1000,
        interest_amount: lender.lender_type === 'bank' ? money(3000, 12000, 500) : 0,
        account_id: bank.id,
        account_name: bank.name,
        notes: `Instalment ${i} of ${instalments}`,
      })
    }
  }
  await inBatches(loanPlans.filter(row => new Date(row.date) <= TODAY), async (row) => {
    const loan = await call('POST', '/loans', row)
    remember('loan', loan?.id)
  }, { label: 'loan entries' })

  // 9. Monthly targets ------------------------------------------------------
  const months = []
  for (let cursor = new Date(START); cursor <= TODAY; cursor.setUTCMonth(cursor.getUTCMonth() + 1)) {
    months.push({ year: cursor.getUTCFullYear(), month: cursor.getUTCMonth() + 1 })
  }
  await inBatches(months, async (row) => {
    const factor = seasonFactor(new Date(Date.UTC(row.year, row.month - 1, 15)))
    const target = await call('PUT', '/monthly-targets', {
      year: row.year,
      month: row.month,
      sales_target: Math.round(1600000 * factor / 10000) * 10000,
      profit_target: Math.round(380000 * factor / 10000) * 10000,
    })
    remember('monthly_target', target?.id)
  }, { concurrency: 3, label: 'monthly targets' })

  // 10. Purchase targets ----------------------------------------------------
  await inBatches(suppliers.slice(0, 6), async (supplier) => {
    const target = await call('POST', '/purchase-targets', {
      supplier_id: supplier.id,
      start_year: START.getUTCFullYear(),
      start_month: START.getUTCMonth() + 1,
      end_year: TODAY.getUTCFullYear(),
      end_month: TODAY.getUTCMonth() + 1,
      total_amount: money(3000000, 9000000, 100000),
    })
    remember('purchase_target', target?.id)
  }, { concurrency: 3, label: 'purchase targets' })

  // 11. Purchases -----------------------------------------------------------
  const purchaseCount = Math.max(12, Math.round(150 * SCALE))
  const purchasePlans = Array.from({ length: purchaseCount }, (_, i) => {
    const supplier = pick(suppliers)
    const mine = products.filter(p => p.supplier_id === supplier.id)
    const pool = mine.length > 0 ? mine : products
    const lineCount = between(2, 6)
    const items = []
    for (let n = 0; n < lineCount; n += 1) {
      const product = pick(pool)
      const qty = between(2, 12)
      const dp = product.cost_price
      const discountPct = pick([0, 0, 2, 3, 5])
      const actual = Math.round(dp * (1 - discountPct / 100))
      const spPct = pick([0, 0, 1, 2, 3])
      items.push({
        product_id: product.id,
        product_code: product.product_code,
        product_name: product.name,
        dp_price: dp,
        discount_pct: discountPct,
        actual_dp: actual,
        qty,
        total_amount: actual * qty,
        sp_pct: spPct,
        sp_amount: Math.round(actual * qty * spPct / 100),
      })
    }
    const total = items.reduce((sum, item) => sum + item.total_amount, 0)
    const discount = chance(0.3) ? Math.round(total * 0.02) : 0
    const net = total - discount
    // Most bills are part-paid on the day and settled later; a few go out
    // fully paid, a few not at all.
    const paid = chance(0.2) ? net : chance(0.15) ? 0 : Math.round(net * (0.3 + rnd() * 0.5) / 100) * 100
    return {
      si_no: `PO-${STAMP}-${String(1000 + i)}`,
      supplier_id: supplier.id,
      supplier_name: supplier.name,
      date: iso(addDays(START, Math.floor((i / purchaseCount) * 350) + between(0, 3))),
      total_amount: total,
      discount_amount: discount,
      net_amount: net,
      paid_amount: paid,
      due_amount: net - paid,
      shipping_status: chance(0.8) ? 'received' : chance(0.5) ? 'partial' : 'pending',
      items: items.map(item => ({ ...item, received_qty: item.qty })),
      notes: 'Stock purchase',
    }
  })
  const purchases = await inBatches(purchasePlans, async (row) => {
    const purchase = await call('POST', '/purchases', row)
    remember('purchase', purchase?.id)
    return { ...row, id: purchase?.id }
  }, { concurrency: 4, label: 'purchases' })

  // 12. Supplier payments against the outstanding bills ---------------------
  const supplierPaymentPlans = []
  for (const purchase of purchases) {
    if (purchase.due_amount <= 0) continue
    let left = purchase.due_amount
    const rounds = between(1, 2)
    for (let i = 0; i < rounds && left > 0; i += 1) {
      const amount = i === rounds - 1 && chance(0.6) ? left : Math.round(left * 0.5 / 100) * 100
      if (amount <= 0) continue
      const when = addDays(new Date(purchase.date), between(7, 60))
      if (when > TODAY) break
      supplierPaymentPlans.push({
        date: iso(when),
        supplier_id: purchase.supplier_id,
        supplier_name: purchase.supplier_name,
        purchase_id: purchase.id,
        purchase_si_no: purchase.si_no,
        amount,
        account_id: bank.id,
        account_name: bank.name,
        notes: `Against ${purchase.si_no}`,
      })
      left -= amount
    }
  }
  await inBatches(supplierPaymentPlans, async (row) => {
    const payment = await call('POST', '/supplier-payments', row)
    remember('supplier_payment', payment?.id)
  }, { concurrency: 5, label: 'supplier payments' })

  // 13. Sales ---------------------------------------------------------------
  const salePlans = []
  let invoice = 1000
  for (let day = new Date(START); day <= TODAY; day = addDays(day, 1)) {
    const weekday = day.getUTCDay()
    // Friday is the busiest day in a Bangladeshi showroom; the shop is quiet
    // but not shut on the others.
    const base = weekday === 5 ? 6 : weekday === 6 ? 4 : 2
    const count = Math.max(0, Math.round((base + between(-1, 2)) * seasonFactor(day) * SCALE))
    for (let n = 0; n < count; n += 1) {
      const customer = pick(customers)
      const lineCount = chance(0.55) ? 1 : between(2, 4)
      const items = []
      for (let k = 0; k < lineCount; k += 1) {
        const product = pick(products)
        const qty = chance(0.75) ? 1 : between(2, 4)
        const discountPct = pick([0, 0, 0, 5, 8, 10, 12])
        const actual = Math.round(product.selling_price * (1 - discountPct / 100))
        items.push({
          product_id: product.id,
          product_code: product.product_code,
          product_name: product.name,
          selling_price: product.selling_price,
          discount_pct: discountPct,
          actual_price: actual,
          qty,
          total_amount: actual * qty,
          cost_price: product.cost_price,
          delivered_qty: qty,
        })
      }
      const subtotal = items.reduce((sum, item) => sum + item.selling_price * item.qty, 0)
      const afterLineDiscounts = items.reduce((sum, item) => sum + item.total_amount, 0)
      const extra = chance(0.18) ? Math.round((afterLineDiscounts * 0.02) / 100) * 100 : 0
      const net = afterLineDiscounts - extra
      const discountAmount = subtotal - net
      // Roughly a third of furniture sales leave something on account.
      const paid = chance(0.62) ? net : Math.round(net * (0.2 + rnd() * 0.6) / 100) * 100
      const account = payAccount()
      salePlans.push({
        invoice_no: `INV-${STAMP}-${++invoice}`,
        date: iso(day),
        customer_id: customer.id,
        customer_name: customer.name,
        customer_phone: customer.phone,
        customer_address: customer.address,
        subtotal,
        discount_amount: discountAmount,
        net_amount: net,
        paid_amount: paid,
        due_amount: net - paid,
        account_id: account.id,
        account_name: account.name,
        status: 'completed',
        items,
        payments: paid > 0 ? [{ date: iso(day), account_id: account.id, account_name: account.name, amount: paid }] : [],
      })
    }
  }
  const sales = await inBatches(salePlans, async (row) => {
    const sale = await call('POST', '/sales', row)
    remember('sale', sale?.id)
    return { ...row, id: sale?.id }
  }, { concurrency: 6, label: 'sales' })

  // 14. Due collections -----------------------------------------------------
  const collectionPlans = []
  for (const sale of sales) {
    if (sale.due_amount <= 0) continue
    if (chance(0.35)) continue // some dues are still outstanding, which is the point
    let left = sale.due_amount
    const rounds = between(1, 2)
    for (let i = 0; i < rounds && left > 0; i += 1) {
      const amount = i === rounds - 1 ? left : Math.round(left * 0.5 / 100) * 100
      if (amount <= 0) continue
      const when = addDays(new Date(sale.date), between(5, 75))
      if (when > TODAY) break
      const account = payAccount()
      collectionPlans.push({
        date: iso(when),
        customer_id: sale.customer_id,
        customer_name: sale.customer_name,
        sale_id: sale.id,
        invoice_no: sale.invoice_no,
        amount,
        account_id: account.id,
        account_name: account.name,
        notes: `Due received against ${sale.invoice_no}`,
      })
      left -= amount
    }
  }
  await inBatches(collectionPlans, async (row) => {
    const payment = await call('POST', '/customer-payments', row)
    remember('customer_payment', payment?.id)
  }, { concurrency: 6, label: 'due collections' })

  // 15. Expenses ------------------------------------------------------------
  const expensePlans = []
  for (let cursor = new Date(START); cursor <= TODAY; cursor.setUTCMonth(cursor.getUTCMonth() + 1)) {
    const year = cursor.getUTCFullYear()
    const month = cursor.getUTCMonth() + 1
    const dayIn = (d) => iso(new Date(Date.UTC(year, month - 1, Math.min(d, 28))))
    for (const category of categories) {
      // Rent is one payment a month; the rest are several smaller ones.
      const times = category.name === 'Shop Rent' ? 1 : between(2, 6)
      for (let i = 0; i < times; i += 1) {
        const budget = Number(category.monthly_budget || 10000)
        const amount = category.name === 'Shop Rent'
          ? budget
          : Math.max(300, Math.round(budget / times * (0.6 + rnd() * 0.7) / 100) * 100)
        const when = dayIn(category.name === 'Shop Rent' ? 3 : between(1, 28))
        if (new Date(when) > TODAY) continue
        const account = payAccount()
        expensePlans.push({
          date: when,
          category_id: category.id,
          category_name: category.name,
          amount,
          account_id: account.id,
          account_name: account.name,
          notes: `${category.name} - ${month}/${year}`,
        })
      }
    }
  }
  await inBatches(expensePlans, async (row) => {
    const expense = await call('POST', '/expenses', row)
    remember('expense', expense?.id)
  }, { concurrency: 6, label: 'expenses' })

  // 16. Other income --------------------------------------------------------
  const otherIncomePlans = []
  for (let i = 0; i < Math.round(40 * SCALE); i += 1) {
    const fromSupplier = chance(0.6)
    const supplier = pick(suppliers)
    const account = payAccount()
    otherIncomePlans.push({
      date: iso(addDays(START, between(0, 350))),
      income_type: fromSupplier ? 'supplier' : 'other',
      supplier_id: fromSupplier ? supplier.id : undefined,
      supplier_name: fromSupplier ? supplier.name : undefined,
      source_name: fromSupplier ? undefined : pick(['Old furniture sale', 'Scrap wood', 'Delivery charge', 'Showroom sublet']),
      amount: money(2000, 45000, 500),
      account_id: account.id,
      account_name: account.name,
      notes: fromSupplier ? 'Supplier incentive' : 'Miscellaneous income',
    })
  }
  await inBatches(otherIncomePlans.filter(row => new Date(row.date) <= TODAY), async (row) => {
    const income = await call('POST', '/other-incomes', row)
    remember('other_income', income?.id)
  }, { concurrency: 5, label: 'other income' })

  // 17. Salaries ------------------------------------------------------------
  const salaryPlans = []
  for (let cursor = new Date(START); cursor <= TODAY; cursor.setUTCMonth(cursor.getUTCMonth() + 1)) {
    const year = cursor.getUTCFullYear()
    const month = cursor.getUTCMonth() + 1
    const payDay = new Date(Date.UTC(year, month - 1, 5))
    if (payDay > TODAY) continue
    for (const employee of employees) {
      salaryPlans.push({
        employee_id: employee.id,
        employee_name: employee.name,
        date: iso(payDay),
        amount: employee.salary,
        // A festival bonus in the two Eid months.
        bonus: month === 4 || month === 6 ? Math.round(employee.salary / 2) : 0,
        payment_type: 'salary',
        category_id: salaryCategory.id,
        category_name: salaryCategory.name,
        period_from: iso(new Date(Date.UTC(year, month - 2, 1))),
        period_to: iso(new Date(Date.UTC(year, month - 1, 0))),
        account_id: cash.id,
        account_name: cash.name,
        notes: `${employee.role} salary`,
      })
    }
  }
  await inBatches(salaryPlans, async (row) => {
    const salary = await call('POST', '/salary-transactions', row)
    remember('salary_transaction', salary?.id)
  }, { concurrency: 5, label: 'salaries' })

  // 18. Profit withdrawals --------------------------------------------------
  const withdrawalPlans = []
  for (let cursor = new Date(START); cursor <= TODAY; cursor.setUTCMonth(cursor.getUTCMonth() + 1)) {
    if (!chance(0.7)) continue
    const year = cursor.getUTCFullYear()
    const month = cursor.getUTCMonth() + 1
    const when = new Date(Date.UTC(year, month - 1, 25))
    if (when > TODAY) continue
    const holder = pick(shareholders)
    withdrawalPlans.push({
      date: iso(when),
      shareholder_id: holder.id,
      shareholder_name: holder.name,
      amount: money(40000, 250000, 5000),
      account_id: bank.id,
      account_name: bank.name,
      profit_month: month,
      profit_year: year,
      notes: 'Monthly profit withdrawal',
    })
  }
  await inBatches(withdrawalPlans, async (row) => {
    const withdrawal = await call('POST', '/profit-withdrawals', row)
    remember('profit_withdrawal', withdrawal?.id)
  }, { concurrency: 4, label: 'profit withdrawals' })

  // 19. Marketing contacts --------------------------------------------------
  const contactPlans = customers.slice(0, Math.round(40 * SCALE)).map(customer => ({
    name: customer.name,
    phone: customer.phone,
    group_name: pick(['Showroom walk-in', 'Online enquiry', 'Repeat buyer', 'Corporate']),
  }))
  await inBatches(contactPlans, async (row) => {
    try {
      const contact = await call('POST', '/marketing-contacts', row)
      remember('marketing_contact', contact?.id)
    } catch {
      // Not worth failing the whole run over the address book.
    }
  }, { concurrency: 5, label: 'marketing contacts' })

  flush()

  const minutes = ((Date.now() - t0) / 60000).toFixed(1)
  console.log(`\nDone in ${minutes} minutes. ${created.length} records created.\n`)
  console.log('   accounts            ', accounts.length)
  console.log('   expense categories  ', categories.length)
  console.log('   suppliers           ', suppliers.length)
  console.log('   products            ', products.length)
  console.log('   customers           ', customers.length)
  console.log('   employees           ', employees.length)
  console.log('   purchases           ', purchases.length)
  console.log('   sales               ', sales.length)
  console.log('   due collections     ', collectionPlans.length)
  console.log('   expenses            ', expensePlans.length)
  console.log('   salaries            ', salaryPlans.length)
  console.log('\nTo undo all of it:  SEED_TOKEN=... node scripts/seed-demo.mjs --wipe')
}

// ------------------------------------------------------------------- main

try {
  if (WIPE) {
    await wipe()
  } else if (CHECK) {
    console.log('Rehearsal: seeding a small sample, then removing it again.\n')
    await seed()
    console.log('\nThe sample went in cleanly. Removing it...\n')
    await wipe()
    console.log('\nEvery payload this script sends was accepted. Run it for real with:')
    console.log('   SEED_TOKEN=... node scripts/seed-demo.mjs')
  } else {
    await seed()
  }
} catch (error) {
  flush()
  console.error(`\nStopped: ${error.message}`)
  console.error(`${created.length} records were created before this and are recorded in seed-demo-ids.json.`)
  console.error('Undo them with:  SEED_TOKEN=... node scripts/seed-demo.mjs --wipe')
  process.exit(1)
}
