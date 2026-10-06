import { Archivo_Narrow, Tenor_Sans } from "next/font/google";
import "./supply-theme.css";

const supplyBody = Archivo_Narrow({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-supply-body",
});

const supplyHeading = Tenor_Sans({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-supply-heading",
});

export default function SupplyOrdersLayout({ children }: LayoutProps<"/salon/orders">) {
  return (
    <div className={`${supplyBody.variable} ${supplyHeading.variable} supply-theme min-h-dvh`}>
      {children}
    </div>
  );
}
