export type MemoryType = "conversation" | "decision" | "learning" | "fact";

export interface MemoryInput {
  content: string;
  source?: string;
  sourceId?: string;
  memoryType?: MemoryType;
  tags?: string[];
  entities?: Record<string, string[]>;
}

export interface MemorySearchParams {
  query: string;
  limit?: number;
  memoryType?: MemoryType;
  source?: string;
  tags?: string[];
  after?: string;
  before?: string;
}

export interface MemoryRecord {
  id: string;
  content: string;
  summary: string | null;
  source: string | null;
  sourceId: string | null;
  memoryType: string | null;
  tags: string[] | null;
  entities: Record<string, string[]>;
  similarity?: number;
  createdAt: Date;
  updatedAt: Date;
}
