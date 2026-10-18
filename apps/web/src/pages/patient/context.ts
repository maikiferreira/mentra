import { useOutletContext } from 'react-router-dom';
import { type Patient } from '../../api';

export type PatientContext = { patient: Patient; id: string };

export function usePatientContext() {
  return useOutletContext<PatientContext>();
}
