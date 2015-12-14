Drawings = new Mongo.Collection('drawings');
Drawings.defaultName = function() {
  //Generate 5 char long random string for name
  var text = "";
  var possible = "abcdefghijklmnopqrstuvwxyz0123456789";
  for (var i = 0; i < 5; i++)
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  return text;
};
var newdrawing = {
  name: Drawings.defaultName(),
  geometries: []
};

if (Meteor.isClient) {
  Meteor.subscribe("drawings");

  //Getters and setters for the name, id, and RGB
  updatecurrentDrawing = function(drawing) {
    setcurrentDrawingName(drawing.name);
    setcurrentDrawingId(drawing._id);
  }

  setcurrentDrawingName = function(value) {
    Session.set("currentDrawingName", value);
  }

  getcurrentDrawingName = function() {
    return Session.get("currentDrawingName");
  }

  setcurrentDrawingId = function(value) {
    Session.set("currentDrawingId", value);
  }

  getcurrentDrawingId = function() {
    return Session.get("currentDrawingId");
  }

  getRGBValue = function(){
    return Session.get("RGBValue");
  }

  generateRGB = function(){
    var rgb = [];
    for (var i=0; i< 3; ++i){
      rgb.push(Math.floor(Math.random()*256));
    }
    return rgb;
  }

  //Set some dummy values for name and RGB
  Session.setDefault("RGBValue", generateRGB());
  Session.setDefault("currentDrawingName", "Welcome");

  //Helpter Functions for the Meteor HTML side of things
  Template.ArcGISDraw.helpers({

    currentDrawingName: function() {
      return Session.get("currentDrawingName");
    },

    drawing: function() {
      if (getcurrentDrawingName() != "Welcome") {
        //Resolve current drawing
        var drawing = Drawings.find({
          name: getcurrentDrawingName()
        });

        //Hook up listener for current drawing, a way to call into dojo when the drawing's geometries change
        var handle = drawing.observeChanges({
          changed: function(id, fields) {
            require(['dojo/dom', "dojo/_base/connect", "dojo/_base/lang"], function(dom, connect, lang) {
              connect.publish("updateGraphics", fields);
            });
          }
        });

        //return the current drawing's geometries (being sent to a dummy storage)
        return JSON.stringify(drawing.fetch()[0].geometries);
      } else {
        return "";
      }
    }
  });

  //A lazy loader to get arcgis api working
  var routePath = "https://js.arcgis.com/3.15",
    routeLoaded = false,
    loadHandler = function() {
      routeLoaded = true;
    };

  Router.route('/', {
    verbose: true,
    name: 'home',
    template: 'ArcGISDraw',
    controller: PreloadController,
    preload: {
      timeOut: 5000,
      styles: ['https://js.arcgis.com/3.15/esri/css/esri.css', 'https://maxcdn.bootstrapcdn.com/bootstrap/3.3.5/css/bootstrap.min.css'],
      sync: routePath,
      onBeforeSync: function(fileName) {
        if (fileName === routePath) {
          var script = document.createElement('script');
          script.rel = 'preload javascript';
          script.type = 'text/javascript';
          script.src = routePath;
          script.onload = loadHandler;
          document.body.appendChild(script);
          return false;
        }
      },
      onSync: function(fileName) {
        if (routeLoaded && fileName === routePath) {
          return !!require && !!define;
        }
      },
      onAfterSync: function(fileName) {
        return false;
      }
    }
  });

  //Main Dojo/ArcGIS Code
  Template.ArcGISDraw.rendered = function() {
      var map;

      require(["esri/map", "esri/toolbars/draw", "esri/symbols/SimpleLineSymbol", "esri/graphic", "esri/Color",
          "esri/geometry/Geometry", "esri/geometry/Polyline",
          "dojo/parser", "dijit/registry",
          "dojo/dom", "dojo/on", "dojo/keys", "dojo/_base/connect", "dojo/query", "dojo/NodeList-dom", "dojo/domReady!"
        ],
        function(Map, Draw, SimpleLineSymbol, Graphic, Color, Geometry, Polyline,
          parser, registry, dom, on, keys, connect, query) {
          parser.parse();

          //keep track if the user has turned on drawing
          drawingState = false;

          map = new Map("map", {
            basemap: "topo",
            center: [-122.45, 37.75],
            zoom: 13
          });

          //Init the drawing toolbar
          map.on("load", initToolbar);

          function initToolbar(evt) {
            tb = new Draw(evt.map, {
              showTooltips: true,
              drawTime: 10
            });
            tb.on("draw-end", completeDrawing);

            // activate drawing tools on button click, toggle the startbutton on/off
            on(dom.byId("StartButton"), "click", function() {
              if(!drawingState){
                tb.activate(Draw.FREEHAND_POLYLINE);
                dom.byId("StartButton").innerHTML = "Stop Drawing";
                query("#StartButton").replaceClass("btn-danger", "btn-success");
                drawingState = true;
              }else{
                tb.deactivate();
                dom.byId("StartButton").innerHTML = "Start Drawing!";
                query("#StartButton").replaceClass("btn-success", "btn-danger");
                drawingState = false;
              }
            });
            newdrawing._id = Drawings.insert(newdrawing);
            updatecurrentDrawing(newdrawing);
          };

          //When a polyline is finished, update the current drawing's geometry
          //this should fire the drawing listener drawing.observeChanges
          function completeDrawing(evt) {
            RGB = getRGBValue();
            evt.geometry.RGB = RGB;

            Drawings.update({
              _id: getcurrentDrawingId()
            }, {
              $push: {
                geometries: evt.geometry
              }
            }, false);
          };

          //Listen for change in the NameInput, either enter or blur
          on(dom.byId("NameInput"), "keyup", function(evt) {
            switch (evt.keyCode) {
              case keys.ENTER:
                evt.preventDefault();
                changDrawingName();
            }
          });

          on(dom.byId("NameInput"), "blur", function(evt) {
            changDrawingName();
          });

          //Called when the NameInput value is changed, to update the current drawing
          function changDrawingName(){
            var newname = dom.byId("NameInput").value.toLowerCase();
            updatedrawing = Drawings.findOne({
              name: newname
            });
            if(updatedrawing){
              //remove all errors, update to new drawing
              query("#submit_error").style("display","none");

              updatecurrentDrawing(updatedrawing);
              initDrawing(updatedrawing.geometries);
            }else{
              //throw error, revert back to original drawing
              var currentname =  getcurrentDrawingName();
              dom.byId("submit_error").innerHTML=newname+" is not a valid session id";
              query("#submit_error").style("display","block");
              dom.byId("NameInput").value = currentname;

              updatedrawing = Drawings.findOne({
                name: currentname
              });
              updatecurrentDrawing(updatedrawing);
              initDrawing(updatedrawing.geometries);
            }
          }

          //called when the NameInput is changed, and a new drawing is loaded
          function initDrawing(geometries) {
            drawAllGeometries(geometries);
          }

          //called from the meteor drawing.observeChanges listener
          //whenever an udpate is made to the geometries of the drawing, this is called
          connect.subscribe("updateGraphics", function(fields) {
            var geometries = fields.geometries;
            drawAllGeometries(geometries);

          });

          //Does the job of rendering all the lines on the map
          function drawAllGeometries(geometries){
            map.graphics.clear();

            //clears out all of the geometries and redraws them
            //not the most efficient, but there were some edge cases I couldn't
            //resolve, and comparing the two geometrie lists (current in map, and new geometries)
            //is going to take a while, so this was implemented
            for (var i = 0; i < geometries.length; ++i) {
              var geom = geometries[i];
              var poly = new Polyline(geom);

              symbol = new SimpleLineSymbol(
                SimpleLineSymbol.STYLE_SOLID,
                new Color([geom.RGB[0], geom.RGB[1], geom.RGB[2], 0.85]),
                6
              );
              var graphic = new Graphic(poly, symbol);
              map.graphics.add(graphic);
            };
          };//End OF DRAWALLGEOMETRIES

        }); //END OF DOJO

    } //END OF TEMPLATE RENDERED

}//END OF CLIENT

Meteor.methods({
});

if (Meteor.isServer) {
  Meteor.startup(function() {
    // code to run on server at startup
  });
  Meteor.publish("drawings", function() {
    return Drawings.find({});
  })
}
