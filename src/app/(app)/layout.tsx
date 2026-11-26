import { Suspense } from "react";
import { SessaoProvider } from "@/lib/sessao";
import { AvisoProvider, Carregando } from "@/components/ui";
import { Shell } from "@/components/shell";

// O app é todo interativo (dados ao vivo do Supabase): a casca carrega na hora
// e o conteúdo de cada tela aparece assim que a sessão é lida no navegador.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<Carregando />}>
      <SessaoProvider>
        <AvisoProvider>
          <Shell>{children}</Shell>
        </AvisoProvider>
      </SessaoProvider>
    </Suspense>
  );
}
