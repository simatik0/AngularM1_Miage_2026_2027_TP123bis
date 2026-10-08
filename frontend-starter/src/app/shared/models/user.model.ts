/** Public user data returned by the API. */
export interface User {
  id: string;
  name: string;
  email: string;
  bio: string;
  hasProfileImage: boolean;
  createdAt: string;
}
