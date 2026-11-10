import auth from '../../server/productionAuth.cjs'

export default async (request) => auth.handleAuth(request)

export const config = {
  path: ['/api/auth/login', '/api/auth/callback', '/api/auth/session', '/api/auth/logout']
}
