const express = require('express');
const app = express();

app.use(express.json())
app.use(express.urlencoded({extended: true}))

var exphbs = require('express-handlebars');
const { query } = require('express');
app.engine('.hbs', exphbs({
    extname: ".hbs"
}));

app.set('view engine', '.hbs');

app.enable('trust proxy');


const { auth } = require('express-openid-connect');

const CLIENT_ID = 'CLIENT_ID';
const CLIENT_SECRET = 'CLIENT_SECRET';
const DOMAIN = 'cs493-russekat.us.auth0.com';

var fetch = require('node-fetch');

// code adapted from
// Title: Auth0-express-webapp-sample
// Author: Auth0-samples
// Source: https://github.com/auth0-samples/auth0-express-webapp-sample/tree/master/01- Login
const config = {
  authRequired: false,
  auth0Logout: true,
  baseURL: 'https://russekat-project.wl.r.appspot.com/',
  clientID: CLIENT_ID,
  issuerBaseURL: `https://${DOMAIN}`,
  secret: CLIENT_SECRET
};

// auth router attaches /login, /logout, and /callback routes to the baseURL
app.use(auth(config));

// req.isAuthenticated is provided from the auth router
app.get('/', (req, res) => {
    if (req.oidc.isAuthenticated()){
        const data = {
            nickname: req.oidc.user.nickname,
            email: req.oidc.user.email,
            sub: req.oidc.user.sub
        }
        fetch('https://russekat-project.wl.r.appspot.com/users',{
            method: 'post',
            headers: { 'content-type': 'application/json', 'accept': 'application/json' },
            body: JSON.stringify(data)
        })
        res.render('./welcome', {
            isAuthenticated: req.oidc.isAuthenticated(),
            data: req.oidc.user,
            token: req.oidc.idToken
        })
    } else {
        res.render('./welcome', {
            isAuthenticated: req.oidc.isAuthenticated()
        })
    }
});

app.use('/', require('./index'));

// Listen to the App Engine-specified port, or 8080 otherwise
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}...`);
});