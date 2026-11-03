// Users are identified by Cloudflare Access, which sits in front of the app and
// adds this header with the email of whoever signed in. The app has no login of
// its own. Outside Cloudflare (local development) DEV_USER_EMAIL is used.
//
// The header can only be trusted because the app is not reachable except through
// the Cloudflare Tunnel; see README ("Seguridad").
const HEADER = 'cf-access-authenticated-user-email';

export function identify(db, { devUserEmail }) {
  const findUser = db.prepare('SELECT * FROM users WHERE email = ?');
  const insertUser = db.prepare('INSERT INTO users (email, name) VALUES (?, ?)');

  return (req, res, next) => {
    const email = (req.get(HEADER) || devUserEmail || '').trim().toLowerCase();
    if (!email) {
      return res.status(401).json({ error: 'No autenticado' });
    }
    let user = findUser.get(email);
    if (!user) {
      insertUser.run(email, email.split('@')[0]);
      user = findUser.get(email);
    }
    req.user = user;
    next();
  };
}
