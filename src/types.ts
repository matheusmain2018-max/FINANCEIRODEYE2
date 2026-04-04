export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
  savingsGoal: number;
  savingsAccumulated: number;
  createdAt: string;
}

export interface Transaction {
  id: string;
  userId: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  status: 'received' | 'paid' | 'pending';
  date: string;
  dueDate?: string;
  category: string;
}

export interface Goal {
  id: string;
  userId: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  deadlineMonths: number;
  createdAt: string;
}

export interface GoalTransaction {
  id: string;
  goalId: string;
  userId: string;
  amount: number;
  type: 'deposit' | 'withdraw';
  date: string;
}

export type OperationType = 'create' | 'update' | 'delete' | 'list' | 'get' | 'write';

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  };
}
