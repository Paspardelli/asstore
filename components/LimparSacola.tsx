"use client";
import { useEffect } from "react";

export default function LimparSacola() {
  useEffect(() => {
    try {
      localStorage.removeItem("as_sacola");
    } catch {}
  }, []);
  return null;
}
