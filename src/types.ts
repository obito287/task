/**
 * Task Management Domain Types & Data Contracts
 */

export type TaskStatus = 'todo' | 'in_progress' | 'completed';

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export type TaskCategory = 'work' | 'personal' | 'shopping' | 'study' | 'other';

export interface Task {
  id: string;
  title: string;
  description?: string;
  category?: TaskCategory;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string; // YYYY-MM-DD
  userId: string;
  createdAt: any;
  updatedAt: any;
}

export interface TaskInput {
  title: string;
  description?: string;
  category?: TaskCategory;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string;
}

export type ViewMode = 'board' | 'list';

export type SortField = 'dueDate' | 'priority' | 'createdAt' | 'title';
export type SortDirection = 'asc' | 'desc';

export interface FilterState {
  searchQuery: string;
  status: 'all' | TaskStatus;
  priority: 'all' | TaskPriority;
  category: 'all' | TaskCategory;
  overdueOnly: boolean;
  sortBy: SortField;
  sortDirection: SortDirection;
}

export interface TaskStatistics {
  total: number;
  todo: number;
  inProgress: number;
  completed: number;
  overdue: number;
  dueSoon: number; // due in next 48 hours
  completionRate: number; // 0 - 100 percentage
}
