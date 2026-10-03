export type Status = "pending" | "waiting" | "done";
export type ChecklistItem = { id: string; title: string; done: boolean };
export type Task = {
  id: string;
  board_id: string;
  title: string;
  note: string;
  checklist?: ChecklistItem[];
  original_request?: string;
  status: Status;
  assigned_to: "me" | "partner" | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};
export type Board = {
  code?: string;
  access?: "owner" | "viewer";
  claimed?: boolean;
  invited_email?: string | null;
  id: string;
  title: string;
  updated_at: string;
  tasks: Task[];
};
export type Mode = "owner" | "viewer" | "preview";
