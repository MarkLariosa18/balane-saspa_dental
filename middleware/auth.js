const isAuthenticated = (req, res, next) => {
    if (req.session.isLoggedIn) return next();
    res.status(401).json({ error: 'Unauthorized', message: 'You must be logged in to access this resource' });
  };
  
  module.exports = { isAuthenticated };