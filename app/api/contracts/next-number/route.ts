import { NextResponse } from "next/server";
import { getNextContractNumber } from "@/lib/contractNumber";
import {
  createAdminSupabase,
  getRequestAuthUser,
  logSupabaseConfigDebug,
} from "@/lib/supabase/server";

export const runtime = "nodejs";

type Body = {
  tenantId?: string;
  companyId?: string;
};

export async function POST(request: Request) {
  logSupabaseConfigDebug("API POST /api/contracts/next-number");

  try {
    const { user, configError } = await getRequestAuthUser(request);
    if (configError || !user) {
      return NextResponse.json(
        { error: configError || "Não autenticado" },
        { status: 401 },
      );
    }

    const body = (await request.json()) as Body;
    const tenantId = body.tenantId?.trim();
    const companyId = (body.companyId || body.tenantId)?.trim();

    if (!tenantId || !companyId) {
      return NextResponse.json(
        { error: "tenantId e companyId são obrigatórios" },
        { status: 400 },
      );
    }

    const { client: admin, configError: adminError } = createAdminSupabase();
    if (!admin || adminError) {
      return NextResponse.json(
        { error: adminError || "Supabase admin não configurado" },
        { status: 503 },
      );
    }

    const contract_number = await getNextContractNumber(
      admin,
      tenantId,
      companyId,
    );

    return NextResponse.json({ contract_number });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[API next-number]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
