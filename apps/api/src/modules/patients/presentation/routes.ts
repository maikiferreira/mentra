import { Router } from 'express';
import { EvolutionService } from '../../care-planning/application/evolution-service.js';
import { FichaService } from '../../evaluations/application/ficha-service.js';
import { getRequestUser, requireAuth } from '../../shared/presentation/http.js';
import { PatientService } from '../application/patient-service.js';
import { RoutinesService } from '../application/routines-service.js';

const patients = new PatientService();
const fichas = new FichaService(patients);
const evolution = new EvolutionService(patients);
const routines = new RoutinesService();

export const patientRouter = Router();
patientRouter.use(requireAuth);
patientRouter.get('/', async (request, response) =>
  response.json(await patients.list(getRequestUser(request))),
);
patientRouter.post('/', async (request, response) =>
  response.status(201).json(await patients.create(getRequestUser(request), request.body)),
);
patientRouter.get('/:id/fichas', async (request, response) =>
  response.json(await fichas.list(getRequestUser(request), request.params.id!)),
);
patientRouter.post('/:id/fichas', async (request, response) =>
  response
    .status(201)
    .json(await fichas.create(getRequestUser(request), request.params.id!, request.body)),
);
patientRouter.get('/:id/evolution', async (request, response) =>
  response.json(await evolution.get(getRequestUser(request), request.params.id!)),
);
patientRouter.patch('/:id/suggestions/:key', async (request, response) =>
  response.json(
    await evolution.updateSuggestion(
      getRequestUser(request),
      request.params.id!,
      request.params.key!,
      request.body,
    ),
  ),
);
patientRouter.get('/:id', async (request, response) =>
  response.json(await patients.get(getRequestUser(request), request.params.id!)),
);
patientRouter.put('/:id', async (request, response) =>
  response.json(await patients.update(getRequestUser(request), request.params.id!, request.body)),
);
patientRouter.delete('/:id', async (request, response) => {
  await patients.delete(getRequestUser(request), request.params.id!);
  response.status(204).end();
});

export const routineRouter = Router();
routineRouter.use(requireAuth);
routineRouter.get('/', async (request, response) =>
  response.json(await routines.list(getRequestUser(request))),
);
