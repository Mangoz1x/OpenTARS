"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { ChatContainer } from "./components/chat-container";
import { Sidebar } from "./components/sidebar";

const SIDEBAR_WIDTH = 260;

export default function Home() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {/* Sidebar */}
      <motion.div
        className="h-full shrink-0 overflow-hidden border-r"
        initial={false}
        animate={{ width: sidebarOpen ? SIDEBAR_WIDTH : 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
      >
        <div className="h-full" style={{ width: SIDEBAR_WIDTH }}>
          <Sidebar />
        </div>
      </motion.div>

      {/* Main content */}
      <div className="h-full min-w-0 flex-1">
        <ChatContainer onToggleSidebar={toggleSidebar} />
      </div>
    </div>
  );
}
