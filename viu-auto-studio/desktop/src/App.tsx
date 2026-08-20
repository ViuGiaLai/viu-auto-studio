import { Routes, Route, Navigate } from "react-router-dom"
import { AppLayout } from "@/layouts/app-layout"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import DashboardPage from "@/pages/dashboard-page"
import ProjectsPage from "@/pages/projects-page"
import ProjectEditorPage from "@/pages/project-editor-page"
import VoiceConfigPage from "@/pages/voice-config-page"
import QueuePage from "@/pages/queue-page"
import LibraryPage from "@/pages/library-page"
import SettingsPage from "@/pages/settings-page"
import GuidePage from "@/pages/guide-page"
import CharactersPage from "@/pages/characters-page"
import FlowPage from "@/pages/flow-page"
import AnalyticsPage from "@/pages/analytics-page"
import WizardPage from "@/pages/wizard-page"
import WorkspacePage from "@/pages/workspace-page"
import SkillLabPage from "@/pages/skill-lab-page"

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/new" element={<WizardPage />} />
          <Route path="projects/:id" element={<ProjectEditorPage />} />
          <Route path="studio" element={<WorkspacePage />} />
          <Route path="queue" element={<QueuePage />} />
          <Route path="library" element={<LibraryPage />} />
          <Route path="voices" element={<VoiceConfigPage />} />
          <Route path="voice" element={<VoiceConfigPage />} />
          <Route path="tts" element={<VoiceConfigPage />} />
          <Route path="characters" element={<CharactersPage />} />
          <Route path="flow" element={<FlowPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="skills" element={<SkillLabPage />} />
          <Route path="guide" element={<GuidePage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  )
}
