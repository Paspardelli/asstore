import Store from "@/components/Store";
import { getProdutos } from "@/lib/data";

export const revalidate = 60;

export default async function Page() {
  const produtos = await getProdutos();
  return <Store produtos={produtos} />;
}
