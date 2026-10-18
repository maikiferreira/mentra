import { Navigate, Route, Routes } from 'react-router-dom';
import { useUIStore } from './ui-store';
import { Protected } from './layout/Protected';
import { PublicLayout } from './layout/PublicLayout';
import { AuthPage } from './pages/AuthPage';
import { HomePage } from './pages/HomePage';
import { PatientFormPage } from './pages/PatientFormPage';
import { PatientList } from './pages/PatientList';
import { RoutinesPage } from './pages/RoutinesPage';
import { AdminOnly } from './pages/UsersPage';
import { EvolutionPage } from './pages/patient/EvolutionPage';
import { PatientDataPage } from './pages/patient/PatientDataPage';
import { PatientFichas } from './pages/patient/PatientFichas';
import { OverviewPage } from './pages/patient/OverviewPage';
import { PrintRoutinePage } from './pages/patient/PrintRoutinePage';
import { ReportPage } from './pages/patient/ReportPage';
import { PatientFrame } from './pages/patient/PatientFrame';

function RouterContent() {
  const session = useUIStore((state) => state.session);
  return (
    <Routes>
      <Route
        path="/login"
        element={
          session ? (
            <Navigate to="/" replace />
          ) : (
            <PublicLayout>
              <AuthPage mode="login" />
            </PublicLayout>
          )
        }
      />
      <Route
        path="/cadastro"
        element={
          session ? (
            <Navigate to="/" replace />
          ) : (
            <PublicLayout>
              <AuthPage mode="signup" />
            </PublicLayout>
          )
        }
      />
      <Route
        path="/quero-testar"
        element={
          session ? (
            <Navigate to="/" replace />
          ) : (
            <PublicLayout>
              <AuthPage mode="trial" />
            </PublicLayout>
          )
        }
      />
      <Route element={<Protected />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/pacientes" element={<PatientList />} />
        <Route path="/pacientes/novo" element={<PatientFormPage />} />
        <Route path="/pacientes/:id/relatorio" element={<ReportPage />} />
        <Route path="/pacientes/:id/rotina" element={<PrintRoutinePage />} />
        <Route path="/pacientes/:id/editar" element={<PatientFormPage editing />} />
        <Route path="/pacientes/:id" element={<PatientFrame />}>
          <Route index element={<PatientFichas />} />
          <Route path="visao-geral" element={<OverviewPage />} />
          <Route path="evolucao" element={<EvolutionPage />} />
          <Route path="dados" element={<PatientDataPage />} />
        </Route>
        <Route path="/rotinas" element={<RoutinesPage />} />
        <Route path="/usuarios" element={<AdminOnly />} />
      </Route>
      <Route path="*" element={<Navigate to={session ? '/' : '/login'} replace />} />
    </Routes>
  );
}

export default function App() {
  return <RouterContent />;
}
