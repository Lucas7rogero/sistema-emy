import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'learning.db');
let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initializeDatabase();
  }
  return db;
}

function initializeDatabase() {
  const db = getDatabase();
  
  // Create learning_rules table
  db.exec(`
    CREATE TABLE IF NOT EXISTS learning_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword TEXT NOT NULL,
      category TEXT NOT NULL,
      subcategoria TEXT NOT NULL,
      responsavel TEXT,
      forma_pgto TEXT,
      sheet_type TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create index for faster keyword searches
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_keyword ON learning_rules(keyword)
  `);

  // Create chat_history table
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export interface LearningRule {
  id?: number;
  keyword: string;
  category: string;
  subcategoria: string;
  responsavel?: string;
  forma_pgto?: string;
  sheet_type: string;
}

export function addLearningRule(rule: LearningRule): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO learning_rules (keyword, category, subcategoria, responsavel, forma_pgto, sheet_type)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(rule.keyword, rule.category, rule.subcategoria, rule.responsavel || null, rule.forma_pgto || null, rule.sheet_type);
}

export function getLearningRules(sheetType: string): LearningRule[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM learning_rules WHERE sheet_type = ?
  `);
  return stmt.all(sheetType) as LearningRule[];
}

export function findMatchingRule(keyword: string, sheetType: string): LearningRule | null {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM learning_rules 
    WHERE keyword LIKE ? AND sheet_type = ?
    ORDER BY keyword DESC
    LIMIT 1
  `);
  const result = stmt.all(`%${keyword}%`, sheetType) as LearningRule[];
  return result.length > 0 ? result[0] : null;
}

export function deleteLearningRule(id: number): void {
  const db = getDatabase();
  const stmt = db.prepare('DELETE FROM learning_rules WHERE id = ?');
  stmt.run(id);
}

export interface ChatMessage {
  id?: number;
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
}

export function addChatMessage(message: ChatMessage): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO chat_history (role, content)
    VALUES (?, ?)
  `);
  stmt.run(message.role, message.content);
}

export function getChatHistory(limit: number = 50): ChatMessage[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM chat_history 
    ORDER BY created_at DESC 
    LIMIT ?
  `);
  return stmt.all(limit) as ChatMessage[];
}

export function clearChatHistory(): void {
  const db = getDatabase();
  db.exec('DELETE FROM chat_history');
}
