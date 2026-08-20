import React from "react"
import ReactDOM from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import { Toaster } from "@/components/ui/toaster"
import App from "./App"
import "./index.css"

// Initialize theme from saved settings / localStorage
const savedTheme = localStorage.getItem("vas.theme")
if (savedTheme === "light") {
  document.documentElement.classList.remove("dark")
} else {
  document.documentElement.classList.add("dark")
}

const savedLang = localStorage.getItem("vas.lang")
if (savedLang) {
  document.documentElement.lang = savedLang
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <App />
    <Toaster />
  </BrowserRouter>,
)
