/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, createContext, useContext } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, collection, query, where, addDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { auth, db, loginWithGoogle, logout } from './lib/firebase';
import { UserProfile, Transaction, Goal, GoalTransaction, FirestoreErrorInfo } from './types';
import { 
  LayoutDashboard, 
  Target, 
  ChevronLeft, 
  ChevronRight, 
  LogOut, 
  Plus, 
  ArrowUpRight, 
  ArrowDownRight, 
  Wallet, 
  Sparkles, 
  PiggyBank,
  Filter,
  CheckCircle2,
  Clock,
  Trash2,
  PlusCircle,
  X,
  TrendingUp,
  TrendingDown,
  Coins,
  Banknote,
  DollarSign
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import { useMemo } from 'react';
import { GoogleGenAI } from '@google/genai';
import Markdown from 'react-markdown';

// --- Context ---
const AuthContext = createContext<{
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
} | null>(null);

const useAuth = () => useContext(AuthContext)!;

// --- Error Handler ---
const handleFirestoreError = (error: unknown, operationType: any, path: string | null) => {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
};

// --- Components ---

function MoneyRain() {
  const items = useMemo(() => {
    return Array.from({ length: 30 }).map((_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      duration: 8 + Math.random() * 15,
      delay: Math.random() * 15,
      size: 16 + Math.random() * 20,
      rotation: Math.random() * 360,
      type: Math.random() > 0.6 ? 'coin' : (Math.random() > 0.3 ? 'note' : 'dollar')
    }));
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {items.map((item) => (
        <motion.div
          key={item.id}
          initial={{ y: -100, x: 0, rotate: item.rotation, opacity: 0 }}
          animate={{ 
            y: '110vh',
            x: [0, 30, -30, 0],
            rotate: item.rotation + 360,
            opacity: [0, 0.4, 0.4, 0]
          }}
          transition={{
            duration: item.duration,
            repeat: Infinity,
            delay: item.delay,
            ease: "linear",
            times: [0, 0.1, 0.9, 1]
          }}
          style={{
            position: 'absolute',
            left: item.left,
            width: item.size,
            height: item.size,
          }}
          className="text-success"
        >
          {item.type === 'coin' ? <Coins size={item.size} /> : (item.type === 'note' ? <Banknote size={item.size} /> : <DollarSign size={item.size} />)}
        </motion.div>
      ))}
    </div>
  );
}

function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <div className="flex items-center gap-2 mb-12">
        <div className="w-10 h-10 bg-success/20 rounded-lg flex items-center justify-center text-success font-bold text-xl">
          $YE
        </div>
        <h1 className="text-2xl font-bold tracking-tighter">DEYNANCEIRO</h1>
      </div>

      <div className="w-24 h-24 bg-white/5 rounded-3xl flex items-center justify-center mb-8 shadow-2xl">
        <span className="text-success font-bold text-3xl">$YE</span>
      </div>

      <h2 className="text-3xl font-bold mb-4">Bem-vindo ao DEYNANCEIRO</h2>
      <p className="text-text-muted max-w-md mb-12 leading-relaxed">
        Sua planilha financeira inteligente com IA e planejamento de metas. 
        Faça login para começar a organizar sua vida financeira.
      </p>

      <button onClick={loginWithGoogle} className="btn-primary px-10 py-4 text-lg">
        <ArrowUpRight className="w-6 h-6" />
        Entrar com Google
      </button>
    </div>
  );
}

function Dashboard() {
  const { user, profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'principal' | 'planejamento'>('principal');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Form state
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'income' | 'expense'>('income');

  // AI state
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Savings state
  const [goals, setGoals] = useState<Goal[]>([]);
  const [isAddingGoal, setIsAddingGoal] = useState(false);
  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [newGoalTarget, setNewGoalTarget] = useState('');
  const [newGoalMonths, setNewGoalMonths] = useState('');

  // Planning state
  const [goalTransactions, setGoalTransactions] = useState<GoalTransaction[]>([]);
  const [goalActionId, setGoalActionId] = useState<string | null>(null);
  const [goalActionType, setGoalActionType] = useState<'deposit' | 'withdraw' | null>(null);
  const [goalActionAmount, setGoalActionAmount] = useState('');

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'goals'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Goal));
      setGoals(data);
    }, (err) => handleFirestoreError(err, 'list', 'goals'));

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'goal_transactions'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GoalTransaction));
      data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setGoalTransactions(data);
    }, (err) => handleFirestoreError(err, 'list', 'goal_transactions'));

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);

    const q = query(
      collection(db, 'transactions'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
      const filtered = data.filter(t => {
        const tDate = new Date(t.date);
        return tDate >= start && tDate <= end;
      });
      setTransactions(filtered);
      setLoading(false);
    }, (err) => handleFirestoreError(err, 'list', 'transactions'));

    return () => unsubscribe();
  }, [user, currentDate]);

  const addTransaction = async () => {
    if (!user || !desc || !amount) return;
    try {
      await addDoc(collection(db, 'transactions'), {
        userId: user.uid,
        description: desc,
        amount: parseFloat(amount),
        type,
        status: type === 'income' ? 'received' : 'pending',
        date: new Date().toISOString(),
        category: 'Geral'
      });
      setDesc('');
      setAmount('');
    } catch (err) {
      handleFirestoreError(err, 'create', 'transactions');
    }
  };

  const deleteTransaction = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'transactions', id));
    } catch (err) {
      handleFirestoreError(err, 'delete', 'transactions');
    }
  };

  const toggleStatus = async (t: Transaction) => {
    try {
      const newStatus = t.status === 'pending' ? (t.type === 'income' ? 'received' : 'paid') : 'pending';
      await updateDoc(doc(db, 'transactions', t.id), { status: newStatus });
    } catch (err) {
      handleFirestoreError(err, 'update', 'transactions');
    }
  };

  const addGoal = async () => {
    if (!user || !newGoalTitle || !newGoalTarget || !newGoalMonths) return;
    try {
      await addDoc(collection(db, 'goals'), {
        userId: user.uid,
        title: newGoalTitle,
        targetAmount: parseFloat(newGoalTarget),
        currentAmount: 0,
        deadlineMonths: parseInt(newGoalMonths),
        createdAt: new Date().toISOString()
      });
      setNewGoalTitle('');
      setNewGoalTarget('');
      setNewGoalMonths('');
      setIsAddingGoal(false);
    } catch (err) {
      handleFirestoreError(err, 'create', 'goals');
    }
  };

  const deleteGoal = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta meta?")) return;
    try {
      await deleteDoc(doc(db, 'goals', id));
    } catch (err) {
      handleFirestoreError(err, 'delete', 'goals');
    }
  };

  const updateGoalAmount = async (goal: Goal, amount: number, type: 'deposit' | 'withdraw') => {
    try {
      const newAmount = type === 'deposit' ? goal.currentAmount + amount : goal.currentAmount - amount;
      if (newAmount < 0) {
        alert("Saldo insuficiente na meta!");
        return;
      }
      await updateDoc(doc(db, 'goals', goal.id), { currentAmount: newAmount });
      
      await addDoc(collection(db, 'goal_transactions'), {
        goalId: goal.id,
        userId: user!.uid,
        amount,
        type,
        date: new Date().toISOString()
      });

      setGoalActionId(null);
      setGoalActionAmount('');
    } catch (err) {
      handleFirestoreError(err, 'update', 'goals');
    }
  };

  const analyzeWithAI = async () => {
    if (isAnalyzing) return;
    setIsAnalyzing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `Analise as seguintes transações financeiras do mês de ${format(currentDate, 'MMMM yyyy', { locale: ptBR })}:
      ${transactions.map(t => `${t.description}: R$ ${t.amount} (${t.type})`).join('\n')}
      
      Saldo Atual: R$ ${totalIncome - totalExpense}
      Metas de Planejamento:
      ${goals.map(g => `${g.title}: R$ ${g.currentAmount} / R$ ${g.targetAmount} (Prazo: ${g.deadlineMonths} meses)`).join('\n')}

      Dê dicas curtas e práticas para melhorar as finanças. Seja motivador e direto.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });
      setAiAnalysis(response.text || "Não foi possível gerar análise.");
    } catch (err) {
      console.error(err);
      setAiAnalysis("Erro ao consultar a IA.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const totalIncome = transactions.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);
  const balance = totalIncome - totalExpense;

  const totalInGoals = goals.reduce((acc, g) => acc + g.targetAmount, 0);
  const totalSavedInGoals = goals.reduce((acc, g) => acc + g.currentAmount, 0);
  const totalMonthlyContribution = goals.reduce((acc, g) => acc + (g.targetAmount / g.deadlineMonths), 0);

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8">
      {/* Header */}
      <header className="flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-success/20 rounded-lg flex items-center justify-center text-success font-bold">
            $YE
          </div>
          <h1 className="text-xl font-bold tracking-tighter">DEYNANCEIRO</h1>
        </div>

        <nav className="flex items-center bg-white/5 p-1 rounded-xl">
          <button 
            onClick={() => setActiveTab('principal')}
            className={`px-6 py-2 rounded-lg font-medium flex items-center gap-2 transition-all ${
              activeTab === 'principal' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-text-muted hover:text-white'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            Principal
          </button>
          <button 
            onClick={() => setActiveTab('planejamento')}
            className={`px-6 py-2 rounded-lg font-medium flex items-center gap-2 transition-all ${
              activeTab === 'planejamento' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-text-muted hover:text-white'
            }`}
          >
            <Target className="w-4 h-4" />
            Planejamento
          </button>
        </nav>

        <div className="flex items-center gap-4">
          <div className="flex items-center bg-white/5 rounded-xl px-4 py-2 gap-4">
            <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="text-text-muted hover:text-white">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="font-medium min-w-[120px] text-center capitalize">
              {format(currentDate, 'MMMM yyyy', { locale: ptBR })}
            </span>
            <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="text-text-muted hover:text-white">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <div className="hidden md:block text-right">
            <p className="text-[10px] text-text-muted uppercase tracking-widest">Saldo Previsto</p>
            <p className="text-success font-bold">R$ {balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          </div>

          <div className="flex items-center gap-3 pl-4 border-l border-white/10">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-medium uppercase">{user?.displayName?.split(' ')[0]}</p>
              <button onClick={logout} className="text-[10px] text-danger flex items-center gap-1 hover:underline">
                SAIR <LogOut className="w-3 h-3" />
              </button>
            </div>
            <img src={user?.photoURL || ''} alt="Avatar" className="w-10 h-10 rounded-full border-2 border-white/10" referrerPolicy="no-referrer" />
          </div>
        </div>
      </header>

      <AnimatePresence mode="wait">
        {activeTab === 'principal' ? (
          <motion.div 
            key="principal"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-8"
          >
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="glass-card flex justify-between items-start group hover:border-success/30 transition-all">
                <div>
                  <p className="text-xs text-text-muted uppercase tracking-widest mb-2">Entradas</p>
                  <h3 className="text-3xl font-bold">R$ {totalIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h3>
                  <p className="text-xs text-success mt-2 flex items-center gap-1">
                    <ArrowUpRight className="w-3 h-3" /> Total de receitas no mês
                  </p>
                </div>
                <div className="p-3 bg-success/10 rounded-xl text-success group-hover:scale-110 transition-transform">
                  <ArrowUpRight className="w-6 h-6" />
                </div>
              </div>

              <div className="glass-card flex justify-between items-start group hover:border-danger/30 transition-all">
                <div>
                  <p className="text-xs text-text-muted uppercase tracking-widest mb-2">Saídas</p>
                  <h3 className="text-3xl font-bold">R$ {totalExpense.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h3>
                  <p className="text-xs text-danger mt-2 flex items-center gap-1">
                    <ArrowDownRight className="w-3 h-3" /> Total planejado para pagar
                  </p>
                </div>
                <div className="p-3 bg-danger/10 rounded-xl text-danger group-hover:scale-110 transition-transform">
                  <ArrowDownRight className="w-6 h-6" />
                </div>
              </div>

              <div className="glass-card flex justify-between items-start group hover:border-primary/30 transition-all">
                <div>
                  <p className="text-xs text-text-muted uppercase tracking-widest mb-2">Saldo Final</p>
                  <h3 className="text-3xl font-bold">R$ {balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h3>
                  <p className="text-xs text-primary mt-2 flex items-center gap-1">
                    <Wallet className="w-3 h-3" /> Previsão após todos os pagamentos
                  </p>
                </div>
                <div className="p-3 bg-primary/10 rounded-xl text-primary group-hover:scale-110 transition-transform">
                  <Wallet className="w-6 h-6" />
                </div>
              </div>
            </div>

            {/* Quick Add */}
            <div className="glass-card border-l-4 border-l-primary">
              <h4 className="flex items-center gap-2 font-bold mb-6">
                <Plus className="w-5 h-5 text-primary" /> Adicionar Transação Rápida
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <input 
                  type="text" 
                  placeholder="Descrição" 
                  className="input-field md:col-span-2" 
                  value={desc}
                  onChange={e => setDesc(e.target.value)}
                />
                <input 
                  type="number" 
                  placeholder="Valor" 
                  className="input-field" 
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                />
                <div className="flex gap-2">
                  <select 
                    className="input-field flex-1"
                    value={type}
                    onChange={e => setType(e.target.value as any)}
                  >
                    <option value="income">Receita</option>
                    <option value="expense">Despesa</option>
                  </select>
                  <button onClick={addTransaction} className="btn-success px-8">
                    <Plus className="w-5 h-5" /> Adicionar
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Transaction List */}
              <div className="lg:col-span-2 glass-card">
                <div className="flex items-center justify-between mb-8">
                  <h4 className="font-bold text-lg">Lista de Pagamentos</h4>
                  <button className="text-text-muted hover:text-white flex items-center gap-2 text-sm">
                    Filtrar por: <Filter className="w-4 h-4" />
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[10px] text-text-muted uppercase tracking-widest border-b border-white/5">
                        <th className="pb-4 font-medium">Status</th>
                        <th className="pb-4 font-medium">Descrição</th>
                        <th className="pb-4 font-medium">Valor</th>
                        <th className="pb-4 font-medium text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {transactions.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-12 text-center text-text-muted">
                            Nenhuma transação encontrada para este mês.
                          </td>
                        </tr>
                      ) : (
                        transactions.map(t => (
                          <tr key={t.id} className="group transition-all duration-500">
                            <td className="py-4 pl-4 transition-all duration-500 group-hover:bg-white/[0.03] group-hover:rounded-l-2xl">
                              <button 
                                onClick={() => toggleStatus(t)} 
                                className={`group/status relative flex items-center gap-3 px-4 py-2.5 rounded-2xl transition-all duration-500 border overflow-hidden active:scale-95 ${
                                  t.status === 'pending' 
                                    ? 'bg-danger/5 border-danger/20 text-danger/70 hover:border-danger/40 hover:bg-danger/10 hover:text-danger' 
                                    : 'bg-success/10 border-success/40 text-success shadow-[0_0_25px_rgba(34,197,94,0.15)] hover:bg-success/20'
                                }`}
                              >
                                <div className="relative z-10 flex items-center gap-2.5">
                                  <div className="relative flex items-center justify-center">
                                    <AnimatePresence mode="wait">
                                      {t.status === 'pending' ? (
                                        <motion.div
                                          key="pending-icon"
                                          initial={{ scale: 0, rotate: -180, opacity: 0 }}
                                          animate={{ scale: 1, rotate: 0, opacity: 1 }}
                                          exit={{ scale: 0, rotate: 180, opacity: 0 }}
                                          transition={{ type: "spring", stiffness: 300, damping: 20 }}
                                        >
                                          <div className="w-2 h-2 rounded-full bg-danger animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
                                        </motion.div>
                                      ) : (
                                        <motion.div
                                          key="done-icon"
                                          initial={{ scale: 0, rotate: -180, opacity: 0 }}
                                          animate={{ scale: 1, rotate: 0, opacity: 1 }}
                                          exit={{ scale: 0, rotate: 180, opacity: 0 }}
                                          transition={{ type: "spring", stiffness: 300, damping: 20 }}
                                        >
                                          <CheckCircle2 className="w-4 h-4 text-success" />
                                        </motion.div>
                                      )}
                                    </AnimatePresence>
                                  </div>
                                  <span className="text-[11px] font-black uppercase tracking-[0.15em]">
                                    {t.status === 'pending' ? 'NÃO PAGO' : (t.type === 'income' ? 'RECEBIDO' : 'PAGO')}
                                  </span>
                                </div>

                                {/* Dynamic Background Glow */}
                                <div className={`absolute inset-0 opacity-0 group-hover/status:opacity-100 transition-opacity duration-700 bg-gradient-to-r ${
                                  t.status === 'pending' ? 'from-danger/20 via-transparent to-transparent' : 'from-success/30 via-transparent to-transparent'
                                }`} />
                              </button>
                            </td>
                            <td className="py-4 transition-all duration-500 group-hover:bg-white/[0.03]">
                              <p className="font-medium">{t.description}</p>
                              <p className="text-[10px] text-text-muted uppercase">{t.category}</p>
                            </td>
                            <td className={`py-4 font-bold transition-all duration-500 group-hover:bg-white/[0.03] ${t.type === 'income' ? 'text-success' : 'text-danger'}`}>
                              {t.type === 'income' ? '+' : '-'} R$ {t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="py-4 pr-4 text-right transition-all duration-500 group-hover:bg-white/[0.03] group-hover:rounded-r-2xl">
                              <button onClick={() => deleteTransaction(t.id)} className="text-text-muted hover:text-danger p-2 opacity-0 group-hover:opacity-100 transition-all">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Sidebar */}
              <div className="space-y-8">
                {/* AI Consultant */}
                <div className="glass-card relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-6">
                      <h4 className="font-bold flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-primary" /> Consultor de IA
                      </h4>
                      <div className="p-1.5 bg-primary/10 rounded-lg text-primary">
                        <Sparkles className="w-4 h-4" />
                      </div>
                    </div>
                    
                    <div className="min-h-[200px] flex flex-col items-center justify-center text-center p-4">
                      {aiAnalysis ? (
                        <div className="text-sm text-left prose prose-invert max-w-full">
                          <Markdown>{aiAnalysis}</Markdown>
                          <button onClick={() => setAiAnalysis(null)} className="mt-4 text-xs text-primary hover:underline">Limpar análise</button>
                        </div>
                      ) : (
                        <>
                          <button 
                            onClick={analyzeWithAI}
                            disabled={isAnalyzing}
                            className={`w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4 hover:bg-white/10 border border-white/5 transition-all ${isAnalyzing ? 'animate-pulse' : ''}`}
                          >
                            <Sparkles className={`w-8 h-8 ${isAnalyzing ? 'text-primary' : 'text-text-muted'}`} />
                          </button>
                          <p className="text-xs text-text-muted leading-relaxed">
                            Clique no ícone para que a IA analise sua planilha e dê dicas.
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="planejamento"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="max-w-6xl mx-auto space-y-8"
          >
            {/* Goals Header */}
            <div className="glass-card flex flex-col md:flex-row items-center justify-between gap-6">
              <div>
                <h2 className="text-2xl font-bold">Metas de Planejamento</h2>
                <p className="text-text-muted text-sm">Defina seus objetivos e acompanhe quanto precisa guardar.</p>
              </div>
              <button 
                onClick={() => setIsAddingGoal(true)}
                className="btn-primary px-8 py-3 shadow-lg shadow-primary/30"
              >
                <PlusCircle className="w-5 h-5" /> Nova Meta
              </button>
            </div>

            {/* Goals Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {goals.length === 0 ? (
                <div className="lg:col-span-2 glass-card py-20 flex flex-col items-center justify-center text-center border-dashed border-2 border-white/10">
                  <PiggyBank className="w-16 h-16 text-text-muted/30 mb-4" />
                  <p className="text-text-muted">Você ainda não tem metas de planejamento.</p>
                </div>
              ) : (
                goals.map(goal => (
                  <div key={goal.id} className="glass-card space-y-6 relative group border-t-4 border-t-primary/50">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-xl font-bold uppercase tracking-tight">{goal.title}</h3>
                        <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Prazo: {goal.deadlineMonths} Meses</p>
                      </div>
                      <button 
                        onClick={() => deleteGoal(goal.id)}
                        className="p-2 text-text-muted hover:text-danger transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Progresso</p>
                        <p className="text-lg font-bold">
                          R$ {goal.currentAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} 
                          <span className="text-text-muted text-sm font-normal ml-1">/ R$ {goal.targetAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </p>
                      </div>
                      <div className="text-left sm:text-right space-y-1">
                        <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Mensal Necessário</p>
                        <p className="text-primary font-bold">
                          R$ {(goal.targetAmount / goal.deadlineMonths).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>

                    <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min((goal.currentAmount / goal.targetAmount) * 100, 100)}%` }}
                        className="h-full bg-primary shadow-[0_0_10px_rgba(37,99,235,0.5)]"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <button 
                        onClick={() => {
                          setGoalActionId(goal.id);
                          setGoalActionType('deposit');
                        }}
                        className="flex-1 py-2.5 rounded-xl bg-success/10 text-success text-xs font-bold uppercase tracking-widest hover:bg-success/20 transition-all"
                      >
                        Depositar
                      </button>
                      <button 
                        onClick={() => {
                          setGoalActionId(goal.id);
                          setGoalActionType('withdraw');
                        }}
                        className="flex-1 py-2.5 rounded-xl bg-danger/10 text-danger text-xs font-bold uppercase tracking-widest hover:bg-danger/20 transition-all"
                      >
                        Sacar
                      </button>
                    </div>

                    {/* Goal Action Overlay */}
                    <AnimatePresence>
                      {goalActionId === goal.id && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          className="absolute inset-0 bg-card/95 backdrop-blur-sm rounded-2xl p-6 flex flex-col justify-center items-center z-20"
                        >
                          <button 
                            onClick={() => setGoalActionId(null)}
                            className="absolute top-4 right-4 text-text-muted hover:text-white"
                          >
                            <X className="w-5 h-5" />
                          </button>
                          <h4 className="font-bold mb-4 uppercase tracking-widest text-sm">
                            {goalActionType === 'deposit' ? 'Depositar em' : 'Sacar de'} {goal.title}
                          </h4>
                          <div className="flex gap-2 w-full max-w-[200px]">
                            <input 
                              type="number" 
                              placeholder="Valor..."
                              className="input-field flex-1 py-2 text-sm"
                              value={goalActionAmount}
                              onChange={e => setGoalActionAmount(e.target.value)}
                              autoFocus
                            />
                            <button 
                              onClick={() => updateGoalAmount(goal, parseFloat(goalActionAmount), goalActionType!)}
                              className={`p-2 rounded-xl text-white ${goalActionType === 'deposit' ? 'bg-success' : 'bg-danger'}`}
                            >
                              <CheckCircle2 className="w-5 h-5" />
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))
              )}
            </div>

            {/* Planning Report */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 glass-card space-y-8">
                <div className="flex items-center gap-3">
                  <Sparkles className="w-5 h-5 text-primary" />
                  <h3 className="text-xl font-bold">Relatório de Planejamento</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-white/5 p-6 rounded-2xl border border-white/5 space-y-2">
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Total em Metas</p>
                    <h4 className="text-2xl font-bold">R$ {totalInGoals.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h4>
                  </div>
                  <div className="bg-white/5 p-6 rounded-2xl border border-white/5 space-y-2">
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Total Guardado</p>
                    <h4 className="text-2xl font-bold text-success">R$ {totalSavedInGoals.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h4>
                  </div>
                  <div className="bg-white/5 p-6 rounded-2xl border border-white/5 space-y-2">
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Aporte Mensal Total</p>
                    <h4 className="text-2xl font-bold text-primary">R$ {totalMonthlyContribution.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h4>
                  </div>
                </div>
              </div>

              {/* Goal Transaction History */}
              <div className="glass-card space-y-6">
                <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                  <Clock className="w-5 h-5 text-text-muted" />
                  <h3 className="font-bold">Histórico do Cofrinho</h3>
                </div>
                <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                  {goalTransactions.length === 0 ? (
                    <p className="text-xs text-text-muted text-center py-8">Nenhuma movimentação ainda.</p>
                  ) : (
                    goalTransactions.map(gt => {
                      const goal = goals.find(g => g.id === gt.goalId);
                      return (
                        <div key={gt.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${gt.type === 'deposit' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                              {gt.type === 'deposit' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                            </div>
                            <div>
                              <p className="text-xs font-bold uppercase tracking-tight">{goal?.title || 'Meta Excluída'}</p>
                              <p className="text-[10px] text-text-muted">{format(new Date(gt.date), 'dd/MM HH:mm')}</p>
                            </div>
                          </div>
                          <p className={`text-sm font-bold ${gt.type === 'deposit' ? 'text-success' : 'text-danger'}`}>
                            {gt.type === 'deposit' ? '+' : '-'} R$ {gt.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Add Goal Modal */}
            <AnimatePresence>
              {isAddingGoal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="glass-card w-full max-w-md space-y-8"
                  >
                    <div className="flex justify-between items-center">
                      <h3 className="text-xl font-bold">Nova Meta</h3>
                      <button onClick={() => setIsAddingGoal(false)} className="text-text-muted hover:text-white">
                        <X className="w-6 h-6" />
                      </button>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Título da Meta</label>
                        <input 
                          type="text" 
                          placeholder="Ex: Reforma, Viagem..."
                          className="input-field w-full"
                          value={newGoalTitle}
                          onChange={e => setNewGoalTitle(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Valor Objetivo</label>
                        <div className="flex items-center bg-background border border-white/10 rounded-xl overflow-hidden focus-within:border-primary transition-all">
                          <span className="pl-4 text-text-muted font-bold text-sm">R$</span>
                          <input 
                            type="number" 
                            placeholder="0,00"
                            className="bg-transparent w-full pl-2 pr-4 py-3 outline-none font-bold"
                            value={newGoalTarget}
                            onChange={e => setNewGoalTarget(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Prazo (Meses)</label>
                        <input 
                          type="number" 
                          placeholder="Ex: 12"
                          className="input-field w-full"
                          value={newGoalMonths}
                          onChange={e => setNewGoalMonths(e.target.value)}
                        />
                      </div>
                    </div>

                    <button 
                      onClick={addGoal}
                      className="btn-primary w-full py-4 text-lg"
                    >
                      Criar Meta
                    </button>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="glass-card p-6 flex items-start gap-4 hover:border-success/30 transition-all">
                <div className="p-3 bg-success/10 rounded-xl text-success">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h5 className="font-bold mb-1">Dica de Ouro</h5>
                  <p className="text-xs text-text-muted">Pague-se primeiro: separe o valor da meta assim que o dinheiro entrar.</p>
                </div>
              </div>
              <div className="glass-card p-6 flex items-start gap-4 hover:border-primary/30 transition-all">
                <div className="p-3 bg-primary/10 rounded-xl text-primary">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div>
                  <h5 className="font-bold mb-1">IA no Planejamento</h5>
                  <p className="text-xs text-text-muted">Use o consultor de IA na aba principal para receber estratégias personalizadas.</p>
                </div>
              </div>
              <div className="glass-card p-6 flex items-start gap-4 hover:border-warning/30 transition-all">
                <div className="p-3 bg-warning/10 rounded-xl text-warning">
                  <Clock className="w-6 h-6" />
                </div>
                <div>
                  <h5 className="font-bold mb-1">Consistência</h5>
                  <p className="text-xs text-text-muted">Pequenos depósitos semanais podem ser mais fáceis de manter do que um grande mensal.</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const userDoc = doc(db, 'users', u.uid);
        const snap = await getDoc(userDoc);
        if (!snap.exists()) {
          const newProfile: UserProfile = {
            uid: u.uid,
            displayName: u.displayName || 'Usuário',
            email: u.email || '',
            photoURL: u.photoURL || '',
            savingsGoal: 1000,
            savingsAccumulated: 0,
            createdAt: new Date().toISOString()
          };
          await setDoc(userDoc, newProfile);
          setProfile(newProfile);
        } else {
          setProfile(snap.data() as UserProfile);
          // Listen for profile updates
          onSnapshot(userDoc, (s) => setProfile(s.data() as UserProfile));
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading }}>
      <div className="min-h-screen bg-background selection:bg-primary/30 relative overflow-hidden">
        <MoneyRain />
        <div className="relative z-10">
          <AnimatePresence mode="wait">
            {!user ? (
              <motion.div 
                key="landing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <LandingPage />
              </motion.div>
            ) : (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <Dashboard />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </AuthContext.Provider>
  );
}
