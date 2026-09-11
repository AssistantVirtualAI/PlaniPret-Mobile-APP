/** Liens directs vers Maestro (ouverture du dossier / de la tâche dans le portail). */
const MAESTRO_WEB_BASE = "https://client.planipret.com";

export const maestroContractUrl = (contractId: string | number) =>
  `${MAESTRO_WEB_BASE}/main/contracts?contract_id=${encodeURIComponent(String(contractId))}`;

export const maestroClientUrl = (clientId: string | number) =>
  `${MAESTRO_WEB_BASE}/main/clients?client_id=${encodeURIComponent(String(clientId))}`;

export const maestroTaskUrl = (taskId: string | number) =>
  `${MAESTRO_WEB_BASE}/main/tasks?task_id=${encodeURIComponent(String(taskId))}`;
