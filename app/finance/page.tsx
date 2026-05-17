"use client";

import {
  Banknote,
  Search,
  Download,
  Filter,
  TrendingDown,
  TrendingUp,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function FinancePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Stats
  const [stats, setStats] = useState({
    received: 0,
    pending: 0,
    overdue: 0,
    overdueCount: 0,
  });

  useEffect(() => {
    if (
      !authLoading &&
      user &&
      user.role !== "SUPER_ADMIN" &&
      user.role !== "ADMIN" &&
      user.role !== "ADMIN_TENANT"
    ) {
      router.replace("/dashboard");
    }

    async function loadFinance() {
      if (!user) return;
      try {
        let query = supabase
          .from("payments")
          .select(
            "*, contracts(*, lotes(name, block_name, number, projects(name)), customers(name))",
          )
          .order("due_date", { ascending: true });

        if (user.role !== "SUPER_ADMIN") {
          if (user.tenant_id) {
            query = query.eq("company_id", user.tenant_id);
          } else {
            query = query.eq(
              "company_id",
              "00000000-0000-0000-0000-000000000000",
            );
          }
        }

        const { data, error } = await query;
        if (error) throw error;

        let received = 0;
        let pending = 0;
        let overdue = 0;
        let overdueCount = 0;

        if (data) {
          data.forEach((p) => {
            if (p.status === "PAID") received += Number(p.amount);
            if (p.status === "PENDING") pending += Number(p.amount);
            if (p.status === "OVERDUE") {
              overdue += Number(p.amount);
              overdueCount++;
            }
          });
          setPayments(data);
        }

        setStats({ received, pending, overdue, overdueCount });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    if (!authLoading) {
      loadFinance();
    }
  }, [user, authLoading]);

  const filteredPayments = payments.filter(
    (p) =>
      p.id?.toLowerCase().includes(search.toLowerCase()) ||
      p.contracts?.buyer_name?.toLowerCase().includes(search.toLowerCase()) ||
      p.contracts?.customers?.name?.toLowerCase().includes(search.toLowerCase()),
  );

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(val);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col h-full">
      <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">
            Módulo Financeiro
          </h1>
          <p className="text-sm font-mono text-[var(--color-text-muted)] uppercase tracking-wider">
            Contratos, Titulos e Inadimplência
          </p>
        </div>
        <button className="bg-[var(--color-surface)] border border-[var(--color-border)] hover:bg-[var(--color-surface-bright)] text-white px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 font-medium transition-colors">
          <Download className="w-5 h-5" />
          Exportar Relatório
        </button>
      </header>

      {/* Finance Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold font-mono text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
                Recebimentos
              </p>
              <h3 className="text-2xl font-light text-white">
                {loading ? "-" : formatCurrency(stats.received)}
              </h3>
            </div>
            <div className="p-2 rounded-lg bg-[var(--color-success)]/10 text-[var(--color-success)]">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
        </div>

        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold font-mono text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
                A Receber
              </p>
              <h3 className="text-2xl font-light text-white">
                {loading ? "-" : formatCurrency(stats.pending)}
              </h3>
            </div>
            <div className="p-2 rounded-lg bg-[var(--color-warning)]/10 text-[var(--color-warning)]">
              <Banknote className="w-5 h-5" />
            </div>
          </div>
        </div>

        <div className="bg-[var(--color-surface)] border border-[var(--color-danger)] rounded-xl p-5 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-2 h-full bg-[var(--color-danger)]" />
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold font-mono text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
                Inadimplência
              </p>
              <h3 className="text-2xl font-light text-[var(--color-danger)]">
                {loading ? "-" : formatCurrency(stats.overdue)}
              </h3>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                {stats.overdueCount} contratos pendentes
              </p>
            </div>
            <div className="p-2 rounded-lg bg-[var(--color-danger)]/10 text-[var(--color-danger)]">
              <TrendingDown className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl flex-1 flex flex-col overflow-hidden shadow-sm">
        <div className="p-4 border-b border-[var(--color-border)] flex gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-2.5 w-5 h-5 text-[var(--color-text-muted)]" />
            <input
              type="text"
              placeholder="Buscar contrato ou cliente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-[var(--color-primary)]"
            />
          </div>
          <select className="bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-[var(--color-primary)] hidden md:block">
            <option>Todas as Situações</option>
            <option>Recebidos</option>
            <option>A Vencer</option>
            <option>Em Atraso</option>
          </select>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-[var(--color-surface)] border-b border-[var(--color-border)] z-10">
              <tr>
                <th className="p-4 text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider font-bold">
                  Contrato / Lote
                </th>
                <th className="p-4 text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider font-bold">
                  Cliente
                </th>
                <th className="p-4 text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider font-bold">
                  Vencimento
                </th>
                <th className="p-4 text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider font-bold text-right">
                  Valor Parcela
                </th>
                <th className="p-4 text-[10px] font-mono text-[var(--color-text-muted)] uppercase tracking-wider font-bold text-center">
                  Situação
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="text-center p-8">
                    <Loader2 className="w-8 h-8 text-[var(--color-primary)] animate-spin mx-auto" />
                  </td>
                </tr>
              ) : filteredPayments.length > 0 ? (
                filteredPayments.map((p) => {
                  const projectName =
                    p.contracts?.lotes?.projects?.name || "Projeto?";
                  const blockName =
                    p.contracts?.lotes?.block_name ||
                    p.contracts?.lotes?.name ||
                    "Quadra?";
                  const lotNumber = p.contracts?.lotes?.number || "Lote?";
                  const loteDesc = `${projectName} - ${blockName}, ${lotNumber}`;

                  return (
                    <FinanceRow
                      key={p.id}
                      contract={
                        p.contracts?.id?.split("-")[0].toUpperCase() || p.id?.split("-")[0].toUpperCase()
                      }
                      lote={loteDesc}
                      client={p.contracts?.buyer_name || p.contracts?.customers?.name || "Desconhecido"}
                      dueDate={new Date(p.due_date).toLocaleDateString()}
                      value={formatCurrency(Number(p.amount))}
                      status={p.status}
                    />
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={5}
                    className="text-center p-8 text-[var(--color-text-muted)] text-sm"
                  >
                    Nenhum recebimento encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function FinanceRow({ contract, lote, client, dueDate, value, status }: any) {
  const getStatusStyle = (s: string) => {
    switch (s) {
      case "PAID":
        return "bg-[var(--color-success)]/10 text-[var(--color-success)] border-[var(--color-success)]/20";
      case "PENDING":
        return "bg-[var(--color-warning)]/10 text-[var(--color-warning)] border-[var(--color-warning)]/20";
      case "OVERDUE":
        return "bg-[var(--color-danger)]/10 text-[var(--color-danger)] border-[var(--color-danger)]/20";
      default:
        return "bg-[var(--color-surface-dim)] text-[var(--color-text-muted)] border-[var(--color-border)]";
    }
  };

  const statusLabel =
    status === "PAID"
      ? "PAGO"
      : status === "PENDING"
        ? "A VENCER"
        : "EM ATRASO";

  return (
    <tr className="border-b border-[var(--color-border)] hover:bg-[var(--color-surface-bright)] transition-colors group cursor-pointer">
      <td className="p-4">
        <div className="font-mono text-xs font-bold text-white mb-1">
          {contract}
        </div>
        <div className="text-xs text-[var(--color-text-muted)]">{lote}</div>
      </td>
      <td className="p-4 font-medium text-sm text-white">{client}</td>
      <td className="p-4 font-mono text-sm text-[var(--color-text-muted)]">
        {dueDate}
      </td>
      <td className="p-4 font-mono text-sm font-medium text-white text-right">
        {value}
      </td>
      <td className="p-4 text-center">
        <span
          className={`inline-flex items-center px-2 py-1 rounded text-[10px] font-mono font-bold uppercase tracking-wider border ${getStatusStyle(status)}`}
        >
          {statusLabel}
        </span>
      </td>
    </tr>
  );
}
