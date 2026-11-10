import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import type { AnalysisRecord, ProfileMemory } from '../src/types/index'

// Node >=22.13: built-in SQLite; no native dependency or external service.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')
export const LOCAL_USER = 'local-owner'
export const RUBRIC = 'campus-evidence-v1'
export class Store {
  private db: any
  constructor(filename = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data/resume-expert.sqlite')) {
    mkdirSync(path.dirname(filename), { recursive: true })
    this.db = new DatabaseSync(filename)
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS schema_versions(version INTEGER PRIMARY KEY);
      INSERT OR IGNORE INTO schema_versions VALUES(1);
      CREATE TABLE IF NOT EXISTS analyses(id TEXT PRIMARY KEY, owner TEXT NOT NULL, created TEXT NOT NULL, role TEXT NOT NULL, version TEXT NOT NULL, payload TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS analyses_owner_date ON analyses(owner, created DESC);
      CREATE TABLE IF NOT EXISTS deleted_records(id TEXT PRIMARY KEY, owner TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS memories(id TEXT PRIMARY KEY, owner TEXT NOT NULL, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS comparisons(id TEXT PRIMARY KEY, owner TEXT NOT NULL, current_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE, baseline_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS issues(id TEXT PRIMARY KEY, analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE, owner TEXT NOT NULL, text TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open');`)
  }
  list(owner = LOCAL_USER): AnalysisRecord[] {
    return this.db.prepare('SELECT payload FROM analyses WHERE owner=? ORDER BY created DESC, id DESC').all(owner).map((r: any) => JSON.parse(r.payload))
  }
  get(id: string, owner = LOCAL_USER): AnalysisRecord | undefined {
    const r = this.db.prepare('SELECT payload FROM analyses WHERE id=? AND owner=?').get(id, owner)
    return r ? JSON.parse(r.payload) : undefined
  }
  save(record: AnalysisRecord, owner = LOCAL_USER) {
    if (this.db.prepare('SELECT id FROM deleted_records WHERE id=?').get(record.id)) throw new Error('记录已删除，不能重新写入')
    const occupied=this.db.prepare('SELECT owner FROM analyses WHERE id=?').get(record.id)
    if (occupied && occupied.owner!==owner) throw new Error('记录不存在')
    const existing = this.get(record.id, owner)
    if (existing && JSON.stringify(existing.input) !== JSON.stringify(record.input)) throw new Error('记录 ID 已用于另一份输入')
    // Created time and original analysis are immutable on retry; only workflow extensions update.
    const next = existing ? { ...record, createdAt: existing.createdAt, initial: existing.initial, rubric:existing.rubric, model:existing.model, followUpAnswers:record.followUpAnswers || existing.followUpAnswers, optimized:record.optimized ?? existing.optimized, mockAnswers:record.mockAnswers ?? existing.mockAnswers, mockEvaluations:record.mockEvaluations ?? existing.mockEvaluations, comparison: record.comparison ?? existing.comparison } : record
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db.prepare('INSERT INTO analyses VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload WHERE analyses.owner=excluded.owner').run(next.id, owner, next.createdAt, next.input.targetRole, next.version, JSON.stringify(next))
      if (!existing) for (const text of next.initial.resumeDiagnosis.problems) this.db.prepare('INSERT INTO issues(id,analysis_id,owner,text) VALUES(?,?,?,?)').run(randomUUID(), next.id, owner, text)
      if (next.comparison && next.baselineId && this.get(next.baselineId, owner)) this.db.prepare('INSERT INTO comparisons VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(next.id, owner, next.id, next.baselineId, JSON.stringify(next.comparison))
      this.db.exec('COMMIT')
      return next
    } catch (e) { this.db.exec('ROLLBACK'); throw e }
  }
  delete(id: string, owner = LOCAL_USER) {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      if (this.get(id,owner)) this.db.prepare('INSERT OR IGNORE INTO deleted_records VALUES(?,?)').run(id,owner)
      this.db.prepare('DELETE FROM analyses WHERE id=? AND owner=?').run(id, owner)
      // Remove embedded comparison snapshots and reference IDs as well.
      for (const r of this.list(owner)) if (r.baselineId === id) {
        delete r.baselineId; delete r.comparison
        this.db.prepare('UPDATE analyses SET payload=? WHERE id=? AND owner=?').run(JSON.stringify(r), r.id, owner)
      }
      this.db.exec('COMMIT')
    } catch (e) { this.db.exec('ROLLBACK'); throw e }
  }
  memories(owner = LOCAL_USER): ProfileMemory[] {
    return this.db.prepare('SELECT payload FROM memories WHERE owner=?').all(owner).map((r: any) => JSON.parse(r.payload))
  }
  memory(m: ProfileMemory, owner = LOCAL_USER) {
    this.db.prepare('INSERT INTO memories VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload WHERE memories.owner=excluded.owner').run(m.id, owner, JSON.stringify(m))
  }
  deleteMemory(id: string, owner = LOCAL_USER) { this.db.prepare('DELETE FROM memories WHERE id=? AND owner=?').run(id, owner) }
  issues(id: string, owner = LOCAL_USER): { id: string; text: string; status: string }[] { return this.db.prepare('SELECT id,text,status FROM issues WHERE analysis_id=? AND owner=?').all(id, owner) }
  issue(id: string, status: string, owner = LOCAL_USER) { this.db.prepare('UPDATE issues SET status=? WHERE id=? AND owner=?').run(status, id, owner) }
  close() { this.db.close() }
}
