import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import LearnApp from "@/components/learn/LearnApp";
import "./learn.css";

const mono = JetBrains_Mono({
  variable: "--font-learn",
  subsets: ["latin", "vietnamese"],
});

export const metadata: Metadata = {
  title: "Học VPS Linux",
  description: "Khoá học VPS Linux theo từng bước: lý thuyết, quiz, thực hành và sửa lỗi",
};

export default function LearnPage() {
  return (
    <div className={`${mono.variable} contents`}>
      <LearnApp />
    </div>
  );
}
