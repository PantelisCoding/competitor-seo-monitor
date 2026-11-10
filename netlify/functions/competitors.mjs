import backend from '../../server/productionBackend.cjs'

export default async (request) => backend.handleCompetitors(request)

export const config = { path: '/api/competitors' }
