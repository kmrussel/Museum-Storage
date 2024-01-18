const express = require('express');
const bodyParser = require('body-parser');
const router = express.Router();

const ds = require('./datastore');

const datastore = ds.datastore;

const MUSEUM = "Museum";
const ARTWORK = "Artwork";
const USER = "User"

router.use(bodyParser.json());

const jwt = require('express-jwt');
const jwksRsa = require('jwks-rsa');

const CLIENT_ID = '8zy0iXTf3pAJJoLSHi0nciMjwCg2H0RQ';
const CLIENT_SECRET = '52Vwy2a6aKlKYD8wQ0M9nmQxEbeseB1zrw4MVqpxRbFyewPDnJMT07LlgO51sKyn';
const DOMAIN = 'cs493-russekat.us.auth0.com';

const checkJwt = jwt({
    secret: jwksRsa.expressJwtSecret({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri: `https://${DOMAIN}/.well-known/jwks.json`
    }),
    
    // Validate the audience and the issuer.
    issuer: `https://${DOMAIN}/`,
    algorithms: ['RS256']
  });

/* ------------- Begin artwork Model Functions ------------- */
function post_artworks(title, artist, date, museum, owner){
    var key = datastore.key(ARTWORK);
	const new_artwork = {"title": title, "artist": artist, "date": date, "museum": museum, "owner": owner };
	return datastore.save({"key":key, "data":new_artwork}).then(() => {return key});
}

async function put_user(sub, aid, req){
    const uid = await get_users(sub);
    const u_key = datastore.key([USER, parseInt(uid,10)]);
    const user = await datastore.get(u_key)
    console.log(uid);
        if( typeof(user[0].artworks) === 'undefined'){
            user[0].artworks = [];
        }
        user[0].artworks.push({
            "id": aid,
            "self": req.protocol + "://" + req.get("host") + "/artworks/" + aid
        })
        return datastore.save({"key": u_key, "data": user[0]});  
   
}

async function remove_user(sub, aid){
    const uid = await get_users(sub);
    const u_key = datastore.key([USER, parseInt(uid,10)]);
    const user = await datastore.get(u_key)

        if( typeof(user[0].artworks) === 'undefined'){
            user[0].artworks = [];
        }
        
        const index = user[0].artworks.indexOf(aid);
        user[0].artworks.splice(index, 1);

        return datastore.save({"key":u_key, "data":user[0]});
       

}
async function get_users(sub) {
    const q = datastore.createQuery(USER);
     const users = await datastore.runQuery(q).then((entities) => {
        return entities[0].map(ds.fromDatastore);
    });
 
    for (user in users) {
        if (users[user].sub === sub) return users[user].id;
    }
    return null; 
}
function get_artworks(req, sub){
    var q = datastore.createQuery(ARTWORK).limit(5);
    const results = {};

    if(Object.keys(req.query).includes("cursor")){
        q = q.start(req.query.cursor);
    }
    // .filter( item => item.owner === owner ) add var
	return datastore.runQuery(q).then( (entities) => {
       
            results.artworks = entities[0].map(ds.fromDatastore).filter(item => item.owner == sub);
            
            results["total"] = results.artworks.length;
            for (entity in results.artworks) {
                results.artworks[entity]["self"] = req.protocol + "://" + req.get("host") + req.baseUrl + "/" + results.artworks[entity].id;
            }
            if(entities[1].moreResults !== ds.Datastore.NO_MORE_RESULTS ){
                results.next = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + entities[1].endCursor;
            }
			return results;
		});
}

function get_artwork(id) {
    const key = datastore.key([ARTWORK, parseInt(id, 10)]);
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

// check name 
async function check_name(name_req, id) {
    const q = datastore.createQuery(ARTWORK);
     const artworks = await datastore.runQuery(q).then((entities) => {
        return entities[0].map(ds.fromDatastore);
    });

    if(artworks.length === 0) return true; 
    for (artwork in artworks) {
        if (id !== null && artworks[artwork].id === id){
            if(artworks[artwork].title === name_req) {
                return true; 
            } else {
                continue; 
            }
        } else {
        if (artworks[artwork].title === name_req) return false;
        }
    }
    return true; 
}


// delete a artwork
// remove from user!
async function delete_artwork(id){
    const key = await datastore.key([ARTWORK, parseInt(id, 10)]);
    const artwork = await datastore.get(key)
    if (artwork[0] === undefined || artwork[0] === null) {
        // No entity found. Don't try to add the id attribute
        return artwork;
    } else { 
        if (artwork[0].museum !== null){
            const m_key = datastore.key([MUSEUM, parseInt(artwork[0].museum.id,10)]);
            const museum = await get_museum(artwork[0].museum.id)
            const index = museum[0].artworks.indexOf(artwork[0].museum.id);
            museum[0].artworks.splice(index, 1);
            await datastore.save({"key":m_key, "data":museum[0]});
            console.log("if statement");
        }
        console.log("going to delete...")
        return datastore.delete(key);
    }
    
}

async function get_museum(id) {
    const key = datastore.key([MUSEUM, parseInt(id, 10)]);
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

// put an artwork
function change_artwork(id, title, artist, date, museum, owner ) {
    const key = datastore.key([ARTWORK, parseInt(id, 10)]);
    const artwork = { "title": title, "artist": artist, "date": date, "museum": museum, "owner": owner};
    return datastore.save({ "key": key, "data": artwork});
}
/* ------------- End Model Functions ------------- */

/* ------------- Begin Controller Functions ------------- */
// create a artwork
router.post('/', checkJwt, function(req, res){
    
    // check content-type and accept headers
    if(req.get('content-type') !== 'application/json'){
        res.status(415).json({ "Error" : "Server only accepts application/json data." } );
        return;
    }
    if(req.get('accept')!== 'application/json'){
        res.status(406).json({ "Error" : "Server only returns application/json data" } );
        return;
    } 

    // check attribute keys
    const attributes = ["title", "artist", "date"];
    const req_att = Object.keys(req.body);  
    for (att in req_att){
        if (!attributes.includes(req_att[att])){
            res.status(400).send({"Error":"The request object contains extraneous attributes"});
            return;
        }
    } 
    
    if (req.body.title && req.body.artist && req.body.date) {

        if (typeof req.body.title !== 'string' || req.body.title.length >= 50)  {
            res.status(400).send({"Error": "Title and Artist must be a string and should be less than 50 characters. Date must be an integer and should be greater than 0."});
            return;
        }

        if (typeof req.body.artist !== 'string' || req.body.artist.length >=50){
            res.status(400).send({"Error": "Title and Artist must be a string and should be less than 50 characters. Date must be an integer and should be greater than 0."});
            return;
        }

        if (!Number.isInteger(req.body.date) || req.body.date <= 0) {
            res.status(400).send({"Error": "Title and Artist must be a string and should be less than 50 characters. Date must be an integer and should be greater than 0."});
            return;
        }

        check_name(req.body.title, null).then(result => {
            if(result){
                post_artworks(req.body.title, req.body.artist, req.body.date, null, req.user.sub)
                .then( key => {
               
                    put_user(req.user.sub, key.id, req)

                    .then(user => {
                        get_artwork(key.id).then(artwork => {
                            console.log(key.id);
                            var artwork_dic = artwork[0];
                            artwork_dic["self"] = req.protocol + "://" + req.get("host") + req.baseUrl + "/" + artwork_dic.id;
                            res.status(201).json(artwork_dic);
                        })
                    })
                    
                } );
            } else {
                res.status(403).send({"Error":"This title is already taken!"});
            }
        })   

        
    } else {
        res.status(400).send({"Error": "The request object is missing at least one of the required attributes"})
    }
});

// make sure to check if owner = owner
// only show artworks that belong to that owner 

// get all artworks, paginate (limit 5), json..
// *SELF
router.get('/', checkJwt, function(req, res){
    get_artworks(req, req.user.sub)
	.then( (artworks) => {
        const accepts = req.accepts(['application/json']);
            if(!accepts){
                res.status(406).json({ "Error" : "Not Acceptable" } );
            } else if(accepts === 'application/json'){
                res.status(200).json(artworks);
            } else { res.status(500).json( { "Error" : "Content type got messed up!" }); }  
    });
});

// get a single artwork 
router.get('/:artwork_id', checkJwt, function(req, res){
    get_artwork(req.params.artwork_id)
        .then(artwork => {
            if (artwork[0] === undefined || artwork[0] === null) {
                res.status(404).json({ "Error": "No artwork with this artwork_id exists" });
            } else {
                var artwork_dic = artwork[0];
                artwork_dic["self"] = req.protocol + "://" + req.get("host") + req.baseUrl + "/" + artwork_dic.id;
                //res.status(200).json(artwork_dic);
                console.log("get single" + artwork[0].owner);
                const accepts = req.accepts(['application/json']);
                if(!accepts){
                    res.status(406).send({"Error": "Not Acceptable"});
                } else if (artwork[0].owner && artwork[0].owner !== req.user.sub){
                    res.status(403).send({"Error": "Forbidden"});
                } else if(accepts === 'application/json'){
                    res.status(200).json(artwork_dic);
                } else { res.status(500).send({"Error": "Content type got messed up!"}); }
            }
        });
});


// only delete if belong to owner and valid 
// delete an artwork
router.delete('/:artwork_id', checkJwt, function(req, res){
    get_artwork(req.params.artwork_id)
        .then(artwork => {
            if (artwork[0] === undefined || artwork[0] === null) {
                res.status(404).json({ "Error": "No artwork with this artwork_id exists" });
            } else if (artwork[0].owner && artwork[0].owner !== req.user.sub){
                res.status(403).json({"Error": "Forbidden"});
            } else {
                remove_user(req.user.sub, req.params.artwork_id)
                .then(delete_artwork(req.params.artwork_id))
                .then(res.status(204).end())
            }
        });
});

// edit a museum (PUT)
router.put('/:artwork_id', checkJwt, function (req, res) {
    // check content-type and accept headers
    if(req.get('content-type') !== 'application/json'){
        res.status(415).send({"Error" : "Server only accepts application/json data." });
        return;
    }
    if(req.get('accept')!== 'application/json'){
        res.status(406).send({"Error": "Server only returns application/json data"});
        return;
    } 

    // check id attribute
    if (req.body.id) {
        res.status(400).json({"Error": "Cannot update value of id"});
        return;
    }

    const attributes = ["title", "artist", "date"];
    const req_att = Object.keys(req.body);
    for (att in req_att){
        if (!attributes.includes(req_att[att])){
            res.status(400).send({"Error":"The request object contains extraneous attributes"});
            return;
        }
    }

    if (req.body.title && req.body.artist && req.body.date) {
        // check attributes
        if (typeof req.body.title !== 'string' || req.body.title.length >= 50)  {
            res.status(400).send({"Error": "Title and Artist must be a string and should be less than 50 characters. Date must be an integer and should be greater than 0."});
            return;
        }

        if (typeof req.body.artist !== 'string' || req.body.artist.length >=50){
            res.status(400).send({"Error": "Title and Artist must be a string and should be less than 50 characters. Date must be an integer and should be greater than 0."});
            return;
        }

        if (!Number.isInteger(req.body.date) || req.body.date <= 0) {
            res.status(400).send({"Error": "Title and Artist must be a string and should be less than 50 characters. Date must be an integer and should be greater than 0."});
            return;
        }
        
        check_name(req.body.title, req.params.artwork_id).then(result => {

            if (result) {
                get_artwork(req.params.artwork_id)
                    .then(artwork => {
                        console.log("put" + artwork[0].owner)
                        if (artwork[0] === undefined || artwork[0] === null) {
                            res.status(404).json({ "Error": "No artwork with this artwork_id exists" });
                        } else if (artwork[0].owner && artwork[0].owner !== req.user.sub){
                            res.status(403).send({"Error": "Forbidden"});
                        } else {
                            var museum = artwork[0].museum;
                            change_artwork(req.params.artwork_id, req.body.title, req.body.artist, req.body.date, museum)
                                .then(result => {
                                    const url = req.protocol + "://" + req.get("host") + req.baseUrl + "/" + req.params.artwork_id;
                                    res.set("Location", url)
                                    res.status(200).send({"id": req.params.artwork_id, "title": req.body.title, "artist": req.body.artist, "date": req.body.date, "museum": museum, "self": url});
                                });
                            
                        }
                    });
            } else {
                res.status(403).send({"Error":"This title is already taken!"});
            }
        
        })
    } else {
        res.status(400).send({"Error": "The request object is missing at least one of the required attributes"})
    }
    
});

// edit an artwork (PATCH)
router.patch('/:artwork_id', checkJwt, function (req, res) {
    // check content-type and accept headers
    if(req.get('content-type') !== 'application/json'){
        res.status(415).send({"Error" : "Server only accepts application/json data."});
        return;
    }
    if(req.get('accept')!== 'application/json'){
        res.status(406).send({"Error": "Server only returns application/json data"});
        return;
    } 

    // check id attribute 
    if (req.body.id) {
        res.status(400).json({"Error": "Cannot update value of id"});
        return;
    }

    // check attribute keys 
    const attributes = ["title", "artist", "date"];
    const req_att = Object.keys(req.body);
    for (att in req_att){
        if (!attributes.includes(req_att[att])){
            res.status(400).send({"Error":"The request object contains extraneous attributes"});
            return;
        }
    }

    // set and check attributes
    var title = null;
    var artist = null;
    var date = null; 
    
    if (req.body.title) {
        if (typeof req.body.title !== 'string' || req.body.title.length >= 50)  {
            res.status(400).send({"Error": "Title and Artist must be a string and should be less than 50 characters. Date must be an integer and should be greater than 0."});
            return;
        }
        title = req.body.title;
    }  

    if (req.body.artist) {
        if (typeof req.body.artist !== 'string' || req.body.artist.length >=50){
            res.status(400).send({"Error": "Title and Artist must be a string and should be less than 50 characters. Date must be an integer and should be greater than 0."});
            return;
        }
        artist = req.body.artist;
    } 

    if (req.body.date) {
        if (!Number.isInteger(req.body.date) || req.body.date <= 0) {
            res.status(400).send({"Error": "Title and Artist must be a string and should be less than 50 characters. Date must be an integer and should be greater than 0."});
            return;
        }
        date = req.body.date; 
    }
    

    check_name(title, req.params.artwork_id).then(result => {
        console.log("patch" + artwork[0].owner);
        if (title === null || result) {
            get_artwork(req.params.artwork_id)
                .then(artwork => {
                    if (artwork[0] === undefined || artwork[0] === null) {
                        res.status(404).json({ "Error": "No artwork with this artwork_id exists" });
                    } else if (artwork[0].owner && artwork[0].owner !== req.user.sub){
                        res.status(403).send({"Error": "Forbidden"});
                    } else {
                        
                        if (title === null) title = artwork[0].title; 
                        if (artist === null) artist = artwork[0].artist; 
                        if (date === null) date = artwork[0].date; 
                        var museum = artwork[0].museum;

                        const url = req.protocol + "://" + req.get("host") + req.baseUrl + "/" + req.params.artwork_id;
                        change_artwork(req.params.artwork_id, title, artist, date, museum)
                            .then(res.status(200).send({ "id": req.params.artwork_id, "title": title, "artist": artist, "date": date, "museum": museum, "self": url }));
                    }
                });
        } else {
            res.status(403).send({"Error":"This title is already taken!"});
        }
    })
});

router.delete('/', function (req, res){
    res.set('Accept', 'GET, POST');
    res.status(405).end();
});

router.put('/', function (req, res){
    res.set('Accept', 'GET, POST');
    res.status(405).end();
});

router.patch('/', function (req, res){
    res.set('Accept', 'GET, POST');
    res.status(405).end();
});
/* ------------- End Controller Functions ------------- */

module.exports = router;
