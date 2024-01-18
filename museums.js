const express = require('express');
const bodyParser = require('body-parser');
const router = express.Router();

const ds = require('./datastore');

const datastore = ds.datastore;

const MUSEUM = "Museum";
const ARTWORK = "Artwork";

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


/* ------------- Begin Museum Model Functions ------------- */
function post_museum(name, location, admission, artworks){
    var key = datastore.key(MUSEUM);
	const new_museum = {"name": name, "location": location, "admission": admission, "artworks": artworks};
	return datastore.save({"key":key, "data":new_museum}).then(() => {return key});
}

function get_museums(req){
    var q = datastore.createQuery(MUSEUM).limit(5);
    const results = {};
    if(Object.keys(req.query).includes("cursor")){
        q = q.start(req.query.cursor);
    }
	return datastore.runQuery(q).then( (entities) => {
            results.museums = entities[0].map(ds.fromDatastore);
            results["total"] = results.museums.length;
            for (entity in results.museums) {
                results.museums[entity]["self"] = req.protocol + "://" + req.get("host") + req.baseUrl + "/" + results.museums[entity].id;
            }
            if(entities[1].moreResults !== ds.Datastore.NO_MORE_RESULTS ){
                results.next = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + entities[1].endCursor;
            }
			return results;
		});
}

function get_museum(id) {
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

// check name 
async function check_name(name_req, id) {
    const q = datastore.createQuery(MUSEUM);
     const museums = await datastore.runQuery(q).then((entities) => {
        return entities[0].map(ds.fromDatastore);
    });

    if(museums.length === 0) return true; 
    for (museum in museums) {
        if (id !== null && museums[museum].id === id){
            if(museums[museum].name === name_req) {
                return true; 
            } else {
                continue; 
            }
        } else {
        if (museums[museum].name === name_req) return false;
        }
    }
    return true; 
}

// put a museum
function change_museum(id, name, location, admission, artworks) {
    const key = datastore.key([MUSEUM, parseInt(id, 10)]);
    const museum = { "name": name, "location": location, "admission": admission, "artworks": artworks };
    return datastore.save({ "key": key, "data": museum });
}

async function delete_museum(id){
    const m_key = await datastore.key([MUSEUM, parseInt(id,10)]);
    var museums = await datastore.get(m_key)
    museum = museums[0]; 
    if (museum.artworks.length !== 0 ) {
        
        for (const artwork in museum.artworks) {
            const a_key = await datastore.key([ARTWORK, parseInt(museum.artworks[artwork].id, 10)]);
            var artwork_info = await datastore.get(a_key); 
            artwork_info[0]["museum"] = null; 
            await datastore.save({"key":a_key, "data":artwork_info[0]})
        }
    }
   
    return datastore.delete(m_key);
}

// MUSEUM & ARTWORK
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

// artworks.museum
function put_museum(id, museum, req){
    const key = datastore.key([ARTWORK, parseInt(id,10)]);
    get_artwork(id).then(artwork => {
        if (museum !== null){
            museum["self"] = req.protocol + "://" + req.get("host") + "/museums/" + museum.id;
        }
        artwork[0]["museum"] = museum;
        return datastore.save({"key":key, "data":artwork[0]});
    })
}

function put_artwork(mid, aid, req){
    const m_key = datastore.key([MUSEUM, parseInt(mid,10)]);
    return datastore.get(m_key)
    .then( (museum) => {
        if( typeof(museum[0].artworks) === 'undefined'){
            museum[0].artworks = [];
        }
        museum[0].artworks.push({
            "id": aid,
            "self": req.protocol + "://" + req.get("host") + "/artworks/" + aid
        })
        museum[0]["id"] = mid;
        put_museum(aid, museum[0], req)
        return datastore.save({"key": m_key, "data": museum[0]});  
    });
}

function remove_artwork(mid, aid, req){
    const m_key = datastore.key([MUSEUM, parseInt(mid,10)]);
    return datastore.get(m_key)
    .then( (museum) => {
        if( typeof(museum[0].artworks) === 'undefined'){
            museum[0].artworks = [];
        }
        
        const index = museum[0].artworks.indexOf(aid);
        museum[0].artworks.splice(index, 1);

        put_museum(aid, null, req);
        return datastore.save({"key":m_key, "data":museum[0]});
       
    });
}

/* ------------- End Model Functions ------------- */

/* ------------- Begin Controller Functions ------------- */
// create a museum 
router.post('/', function(req, res){
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
    const attributes = ["name", "location", "admission"];
    const req_att = Object.keys(req.body);  
    for (att in req_att){
        if (!attributes.includes(req_att[att])){
            res.status(400).json({"Error":"The request object contains extraneous attributes"});
            return;
        }
    } 

    if ( req.body.name && req.body.location && req.body.admission) {
        
        if (typeof req.body.name !== 'string' || req.body.name.length >= 24)  {
            res.status(400).send({"Error": "Name and Location must be a string and should be less than 24 characters. Admission must be an integer and should be greater than or equal to 0."});
            return;
        }


        if (typeof req.body.location !== 'string' || req.body.location.length >=24){
            res.status(400).send({"Error": "Name and Location must be a string and should be less than 24 characters. Admission must be an integer and should be greater than or equal to 0."});
            return;
        }


        if (!Number.isInteger(req.body.admission) || req.body.admission < 0) {
            res.status(400).send({"Error": "Name and Location must be a string and should be less than 24 characters. Admission must be an integer and should be greater than or equal to 0."});
            return;
        }

            check_name(req.body.name, null).then(result => {
                if(result){
                    post_museum(req.body.name, req.body.location, req.body.admission, [], req)
                    .then( key => {
                        get_museum(key.id)
                        .then( museum => {
                            var museum_dic = museum[0];
                            museum_dic["self"] = req.protocol + "://" + req.get("host") + req.baseUrl + "/" + museum_dic.id;
                            res.status(201).json(museum_dic);
                        })
                    } ); 
                } else {
                    res.status(403).send({"Error":"This name is already taken!"});
                }
             })    
        
    } else {
        res.status(400).send({"Error":"The request object is missing at least one of the required attributes"});
    }
});

// get a single museum
router.get('/:museum_id', function(req, res){
    get_museum(req.params.museum_id)
        .then(museum => {
            if (museum[0] === undefined || museum[0] === null) {
                res.status(404).json({ "Error": "No museum with this museum_id exists" });
            } else {
                var museum_dic = museum[0];
                museum_dic["self"] = req.protocol + "://" + req.get("host") + req.baseUrl + "/" + museum_dic.id;
                //res.status(200).json(museum_dic);

                const accepts = req.accepts(['application/json']);
                if(!accepts){
                    res.status(406).send({"Error" : "Not Acceptable"});
                } else if(accepts === 'application/json'){
                    res.status(200).json(museum_dic);
                } else { res.status(500).json({ "Error" : "Content type got messed up!" } ); }
            }
        });
});

// get all museums, pagination (limit 5)
// SELF **
router.get('/', function(req, res){
    get_museums(req)
	.then( (museums) => {
        const accepts = req.accepts(['application/json']);
            if(!accepts){
                res.status(406).json({ "Error" : "Not Acceptable" } );
            } else if(accepts === 'application/json'){
                res.status(200).json(museums);
            } else { res.status(500).json( { "Error" : "Content type got messed up!" }); }
    });
});


// delete a museum 
router.delete('/:museum_id', function(req, res){
    get_museum(req.params.museum_id)
    .then(museum => {
        if (museum[0] === undefined || museum[0] === null) {
            res.status(404).json({ "Error": "No museum with this museum_id exists" });
        } else {
            delete_museum(req.params.museum_id).then(res.status(204).end())
        }
    });
});

// edit a museum (PUT)
router.put('/:museum_id', function (req, res) {
    // check content-type and accept headers
    if(req.get('content-type') !== 'application/json'){
        res.status(415).json({ "Error" : "Server only accepts application/json data." } );
        return;
    }
    if(req.get('accept')!== 'application/json'){
        res.status(406).json({ "Error" : "Server only returns application/json data" } );
        return;
    } 

    // check id attribute
    if (req.body.id) {
        res.status(400).json({"Error": "Cannot update value of id"});
        return;
    }

    const attributes = ["name", "location", "admission"];
    const req_att = Object.keys(req.body);
    for (att in req_att){
        if (!attributes.includes(req_att[att])){
            res.status(400).send({"Error":"The request object contains extraneous attributes"});
            return;
        }
    }

    if (req.body.name && req.body.location && req.body.admission) {
        // check attributes
        if (typeof req.body.name !== 'string' || req.body.name.length >= 24)  {
            res.status(400).send({"Error": "Name and Type must be a string and should be less than 24 characters. Admission must be an integer and should be greater than or equal to 0."});
            return;
        }
        
        if (typeof req.body.location !== 'string' || req.body.location.length >=24){
            res.status(400).send({"Error": "Name and Location must be a string and should be less than 24 characters. Admission must be an integer and should be greater than or equal to 0."});
            return;
        }
        
        if (!Number.isInteger(req.body.admission) || req.body.admission < 0) {
            res.status(400).send({"Error": "Name and Location must be a string and should be less than 24 characters. Admission must be an integer and should be greater than or equal to 0."});
            return;
        }
        
        check_name(req.body.name, req.params.museum_id).then(result => {

            if (result) {
                get_museum(req.params.museum_id)
                    .then(museum => {
                        if (museum[0] === undefined || museum[0] === null) {
                            res.status(404).json({ "Error": "No museum with this museum_id exists" });
                        } else {
                            var artworks = museum[0].artworks;
                            change_museum(req.params.museum_id, req.body.name, req.body.location, req.body.admission, artworks)
                                .then(result => {
                                    const url = req.protocol + "://" + req.get("host") + req.baseUrl + "/" + req.params.museum_id;
                                    res.set("Location", url)
                                    res.status(303).send({"id": req.params.museum_id, "name": req.body.name, "location": req.body.location, "admission": req.body.admission, "artworks": artworks, "self": url});
                                });
                            
                        }
                    });
            } else {
                res.status(403).send({"Error":"This name is already taken!"});
            }
        
        })
    } else {
        res.status(400).send({"Error": "The request object is missing at least one of the required attributes"})
    }
    
});

// edit a museum (PATCH)
router.patch('/:museum_id', function (req, res) {
    // check content-type and accept headers
    if(req.get('content-type') !== 'application/json'){
        res.status(415).json({ "Error" : "Server only accepts application/json data." });
        return;
    }
    if(req.get('accept')!== 'application/json'){
        res.status(406).json({ "Error" : "Server only returns application/json data" } );
        return;
    } 

    // check id attribute 
    if (req.body.id) {
        res.status(400).json({"Error": "Cannot update value of id"});
        return;
    }

    // check attribute keys 
    const attributes = ["name", "location", "admission"];
    const req_att = Object.keys(req.body);
    for (att in req_att){
        if (!attributes.includes(req_att[att])){
            res.status(400).send({"Error":"The request object contains extraneous attributes"});
            return;
        }
    }

    // set and check attributes
    var name = null;
    var location = null;
    var admission = null; 
    
    if (req.body.name) {
        if (typeof req.body.name !== 'string' || req.body.name.length >= 24)  {
            res.status(400).send({"Error": "Name and Location must be a string and should be less than 24 characters. Admission must be an integer and should be greater than or equal to 0."});
            return;
        }
        name = req.body.name;
    }  

    if (req.body.location) {
        if (typeof req.body.location !== 'string' || req.body.location.length >=24){
            res.status(400).send({"Error": "Name and Location must be a string and should be less than 24 characters. Admission must be an integer and should be greater than or equal to 0."});
            return;
        }
        location = req.body.location;
    } 

    if (req.body.admission) {
        if (!Number.isInteger(req.body.admission) || req.body.admission < 0) {
            res.status(400).send({"Error": "Name and Location must be a string and should be less than 24 characters. Admission must be an integer and should be greater than or equal to 0."});
            return;
        }
        admission = req.body.admission; 
    }
    

    check_name(name, req.params.museum_id).then(result => {
    
        if (name === null || result) {
            get_museum(req.params.museum_id)
                .then(museum => {
                    if (museum[0] === undefined || museum[0] === null) {
                        res.status(404).json({ "Error": "No museum with this museum_id exists" });
                    } else {
                        
                        if (name === null) name = museum[0].name; 
                        if (location === null) location = museum[0].location; 
                        if (admission === null) admission = museum[0].admission; 
                        var artworks = museum[0].artworks; 

                        const url = req.protocol + "://" + req.get("host") + req.baseUrl + "/" + req.params.museum_id;
                        change_museum(req.params.museum_id, name, location, admission, artworks)
                            .then(res.status(200).send({ "id": req.params.museum_id, "name": name, "location": location, "admission": admission, "artworks": artworks, "self": url }));
                    }
                });
        } else {
            res.status(403).send({"Error":"This name is already taken!"});
        }
    })
});


/* ------------- MUSEUM & ARTWORKS RELATIONSHIP ------------- */
// assign a artwork to a museum 
router.put('/:mid/artworks/:aid', checkJwt, function(req, res){
    get_museum(req.params.mid).then(museum => {
        // museum doesn't exist 
        if (museum[0] === undefined || museum[0] === null) {
            res.status(404).json({ "Error": "The specified museum and/or artwork does not exist" });
        } else {
            // artwork doesnt exist
            get_artwork(req.params.aid).then(artwork => {
                if (artwork[0] === undefined || artwork[0] === null) {
                    res.status(404).json({ "Error": "The specified museum and/or artwork does not exist" });
                } else if (artwork[0].museum !== null) {
                    res.status(403).json({ "Error": "The artwork is already in another museum" });
                } else if (artwork[0].owner && artwork[0].owner !== req.user.sub){
                    res.status(403).send({"Error" : "Forbidden"});
                } else {
                    put_artwork(req.params.mid, req.params.aid, req)
                    .then(res.status(204).end());
                }
            })
        }
    })
});

// remove a artwork from a museum
router.delete('/:mid/artworks/:aid', checkJwt, function(req, res){
    get_museum(req.params.mid).then(museum => {
        // museum doesn't exist 
        if (museum[0] === undefined || museum[0] === null) {
            res.status(404).json({ "Error": "No museum with this museum_id has an artwork with this artwork_id" });
        } else {
            // artwork doesnt exist 
            get_artwork(req.params.aid).then(artwork => {
                if (artwork[0] === undefined || artwork[0] === null) {
                    res.status(404).json({ "Error": "No museum with this museum_id has an artwork with this artwork_id" });
                } else if (artwork[0].museum === null) {
                    res.status(404).json({ "Error": "No museum with this museum_id has an artwork with this artwork_id" });
                }
                else if (artwork[0].museum.id != museum[0].id) {
                    res.status(404).json({ "Error": "No museum with this museum_id has an artwork with this artwork_id" });
                } else if (artwork[0].owner && artwork[0].owner !== req.user.sub){
                    res.status(403).send({"Error": "Forbidden"});
                } else {
                    remove_artwork(req.params.mid, req.params.aid, req)
                    .then(res.status(204).end());
                }
            })
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