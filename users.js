const express = require('express');
const bodyParser = require('body-parser');
const router = express.Router();

const ds = require('./datastore');

const datastore = ds.datastore;

const USER = "User";

router.use(bodyParser.json());

/* ------------- Begin user Model Functions ------------- */
function post_user(nickname, email, sub, artworks){
    var key = datastore.key(USER);
	const new_user = {"nickname": nickname, "email": email, "sub": sub, "artworks": artworks};
	return datastore.save({"key":key, "data":new_user}).then(() => {return key});
}

function get_users() {
    const q = datastore.createQuery(USER);
    return datastore.runQuery(q).then((entities) => {
        return entities[0].map(ds.fromDatastore);
    });
}

function get_user(id) {
    const key = datastore.key([USER, parseInt(id, 10)]);
    return datastore.get(key).then((entity) => {
        if (entity[0] === undefined || entity[0] === null) {
            // No entity found. Don't try to add the id attribute
            return entity;
        } else {
            // Use Array.map to call the function fromDatastore. This function
            // adds id attribute to every element in the array entity
            return entity.map(ds.fromDatastore);
        }
    });
}

async function check_name(sub_req) {
    const q = datastore.createQuery(USER);
     const users = await datastore.runQuery(q).then((entities) => {
        return entities[0].map(ds.fromDatastore);
    });

    if(users.length === 0) return true; 
    for (user in users) {
        if (users[user].sub === sub_req) return false;
    }
    return true; 
} 

/* ------------- End Model Functions ------------- */

/* ------------- Begin Controller Functions ------------- */

router.post('/callback', function(req, res){
    console.log(req.user)
    res.render('welcome');
});

router.post('/users', function(req, res){
    if (req.body.nickname && req.body.email && req.body.sub) {
        if(req.get('content-type') !== 'application/json'){
            res.status(415).json({ "Error" : "Server only accepts application/json data." } );
            return;
        }
        if(req.get('accept')!== 'application/json'){
            res.status(406).json({ "Error" : "Server only returns application/json data" } );
            return;
        } 
        check_name(req.body.sub).then(result => {
            if(result){
                post_user(req.body.nickname, req.body.email, req.body.sub, [])
                .then( key => {
                    get_user(key.id).then(user => {
                        var user_dic = user[0];
                        user_dic["self"] = req.protocol + "://" + req.get("host") + req.baseUrl + "/" + user_dic.id;
                        res.status(201).json(user_dic);
                        })
                });
            } else {
                res.status(403).json({"Error": "This sub is already taken"});
            }  
        });    
    } else {
        res.status(400).send({"Error": "The request object is missing at least one of the required attributes"})
    }
});

// get all users (unprotected)
router.get('/users', function(req, res){
    get_users(req)
	.then( (users) => {
        const accepts = req.accepts(['application/json']);
            if(!accepts){
                res.status(406).json({ "Error" : "Not Acceptable" } );
            } else if(accepts === 'application/json'){
                res.status(200).json(users);
            } else { res.status(500).json( { "Error" : "Content type got messed up!" }); }
    });
});

module.exports = router;