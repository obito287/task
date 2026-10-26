import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { OperationType, db, handleFirestoreError } from '../firebase/config';
import { Task, TaskInput, TaskStatistics } from '../types';

const TASKS_COLLECTION = 'tasks';

/**
 * Subscribe to real-time task updates for the current authenticated user
 */
export function subscribeToTasks(
  userId: string,
  onTasks: (tasks: Task[]) => void,
  onError?: (error: Error) => void
): () => void {
  const collectionRef = collection(db, TASKS_COLLECTION);
  // Strictly scope the query to current user's tasks
  const userTasksQuery = query(collectionRef, where('userId', '==', userId));

  return onSnapshot(
    userTasksQuery,
    (snapshot) => {
      const tasks: Task[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          title: data.title || 'Untitled Task',
          description: data.description || '',
          category: data.category || 'work',
          status: data.status || 'todo',
          priority: data.priority || 'medium',
          dueDate: data.dueDate || '',
          userId: data.userId,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        };
      });
      onTasks(tasks);
    },
    (error) => {
      console.error('Error listening to tasks:', error);
      if (onError) {
        onError(error);
      }
      handleFirestoreError(error, OperationType.LIST, TASKS_COLLECTION);
    }
  );
}

/**
 * Create a new task document in Cloud Firestore
 */
export async function createTask(userId: string, input: TaskInput): Promise<string> {
  const path = TASKS_COLLECTION;
  try {
    const payload: Record<string, any> = {
      title: input.title.trim(),
      status: input.status,
      priority: input.priority,
      dueDate: input.dueDate,
      userId: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    if (input.category) {
      payload.category = input.category;
    } else {
      payload.category = 'work';
    }

    if (input.description && input.description.trim().length > 0) {
      payload.description = input.description.trim();
    }

    const docRef = await addDoc(collection(db, TASKS_COLLECTION), payload);
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

/**
 * Update an existing task in Cloud Firestore
 */
export async function updateTask(taskId: string, updates: Partial<TaskInput>): Promise<void> {
  const path = `${TASKS_COLLECTION}/${taskId}`;
  try {
    const docRef = doc(db, TASKS_COLLECTION, taskId);
    const payload: Record<string, any> = {
      updatedAt: serverTimestamp(),
    };

    if (updates.title !== undefined) payload.title = updates.title.trim();
    if (updates.description !== undefined) {
      payload.description = updates.description.trim();
    }
    if (updates.category !== undefined) payload.category = updates.category;
    if (updates.status !== undefined) payload.status = updates.status;
    if (updates.priority !== undefined) payload.priority = updates.priority;
    if (updates.dueDate !== undefined) payload.dueDate = updates.dueDate;

    await updateDoc(docRef, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Delete a task document by ID
 */
export async function deleteTask(taskId: string): Promise<void> {
  const path = `${TASKS_COLLECTION}/${taskId}`;
  try {
    const docRef = doc(db, TASKS_COLLECTION, taskId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Compute statistical metrics for the user's tasks
 */
export function calculateTaskStatistics(tasks: Task[]): TaskStatistics {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const in48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const in48HoursStr = in48Hours.toISOString().split('T')[0];

  let todo = 0;
  let inProgress = 0;
  let completed = 0;
  let overdue = 0;
  let dueSoon = 0;

  for (const t of tasks) {
    if (t.status === 'completed') {
      completed++;
    } else if (t.status === 'in_progress') {
      inProgress++;
    } else {
      todo++;
    }

    // Check deadlines if not completed
    if (t.status !== 'completed' && t.dueDate) {
      if (t.dueDate < todayStr) {
        overdue++;
      } else if (t.dueDate <= in48HoursStr) {
        dueSoon++;
      }
    }
  }

  const total = tasks.length;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  return {
    total,
    todo,
    inProgress,
    completed,
    overdue,
    dueSoon,
    completionRate,
  };
}

/**
 * Export tasks as a CSV file and trigger user download
 */
export function exportTasksAsCSV(tasks: Task[]): void {
  const headers = ['ID', 'Title', 'Category', 'Status', 'Priority', 'Due Date', 'Description'];
  const rows = tasks.map((t) => [
    t.id,
    `"${(t.title || '').replace(/"/g, '""')}"`,
    `"${t.category || 'work'}"`,
    `"${t.status}"`,
    `"${t.priority}"`,
    `"${t.dueDate || ''}"`,
    `"${(t.description || '').replace(/"/g, '""')}"`,
  ]);

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, `tasks_backup_${formatCurrentDate()}.csv`);
}

/**
 * Export tasks as a JSON file and trigger user download
 */
export function exportTasksAsJSON(tasks: Task[]): void {
  const cleanTasks = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    category: t.category || 'work',
    status: t.status,
    priority: t.priority,
    dueDate: t.dueDate,
    description: t.description || '',
    userId: t.userId,
    exportedAt: new Date().toISOString(),
  }));

  const jsonContent = JSON.stringify(cleanTasks, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
  triggerDownload(blob, `tasks_backup_${formatCurrentDate()}.json`);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function formatCurrentDate(): string {
  return new Date().toISOString().split('T')[0];
}
