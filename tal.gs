"use strict";

class AssertionError extends Error { }

function assert(condition, friendly = condition) {
  if (!condition) {
    throw new AssertionError(`Internal error: assert ${friendly || condition.toString()}==false`);
  }
}

function valid(first = "", value = "", maximumErrors = 2) {
  const findDiff = (str1, str2, last) =>
    [...str1].findIndex((el, index) => (el !== str2[index]) && (index !== last));
  var last = -1;
  var errors = 0;
  var diff = -1;
  for (var f = 0; f < maximumErrors; f++) {
    diff = findDiff(first, value, last);
    if (diff > -1) {
      errors++;
      last = diff;
    }
  }
  return errors <= maximumErrors;
}

const Location = {
  North: 0,
  East: 1,
  South: 2,
  West: 3,
  Unknown: -1
};

function setTimeout(func, timeout) {
  var lock = LockService.getScriptLock();
  lock.waitLock(timeout);

  func();

  lock.releaseLock();
}

function print(str, styl, world) {
  if (styl instanceof World) {
    world = styl;
  }
  world.emailCache.push(`<p style='${styl}'>${str}</p>`);
}

function send(world) {
  let email = "<div style=\"font-family: monospace\">Type your command above this line and don't remove this<br/>";
  world.emailCache.forEach((item) => {
    if (item) {
      email = email + item;
    }
  });
  email = email + "</div>";
  Logger.log(`Sending ${email} to ${world.email}`);

  var threads = GmailApp.getInboxThreads();
  var thread = null;
  var lastMessage = null;
  for (var i = 0; i < threads.length; i++) {
    thread = threads[i];
    if (thread.isUnread() && thread.getFirstMessageSubject() == "Email game") {
      lastMessage = thread.getMessages()[thread.getMessageCount() - 1];
      if (lastMessage.getFrom() == world.email) {
        thread.reply(
          email,
          {
            htmlBody: email,
            name: "Email Game Bot"
          }
        );
        return;
      }
    }
  }
  GmailApp.sendEmail(world.email, "Email game", "", {
    htmlBody: email,
    name: "Email Game Bot"
  })
}


class Item {
  constructor(name, sdesc, ldesc, weight = 1, prop = { "use": false, "consume": false, "pickup": true, "useroom": false, "onExamine": false, "enter": false, "under": false, "hidden": false }) {
    this.name = name;
    this.sdesc = sdesc;
    this.ldesc = ldesc;
    this.prop = prop;
    this.weight = weight;
  }
}

class Person extends Item {
  constructor(name, sdesc, ldesc, weight = 1, prop = { "use": false, "consume": false, "pickup": false, "useroom": false, "onExamine": false, "enter": false, "under": false, "hidden": false, "arrest": false }) {
    super(name, sdesc, ldesc, weight, prop);
    this.name = name;
    this.sdesc = sdesc;
    this.ldesc = ldesc;
    this.prop = prop;
    this.weight = weight;
    this.dialog = {};
    this.showResponses = {};
  }
  addDialog(prompt, response) {
    if (prompt instanceof String) {
      this.dialog[prompt] = response;
    } else if (typeof prompt[Symbol.iterator] === 'function') {
      for (var i = 0; i < prompt.length; i++) {
        this.dialog[prompt[i]] = response;
      }
    }
  }
  addShowResponse(item, response) {
    if (item instanceof Item) {
      this.showResponses[item] = response;
    } else if (typeof item[Symbol.iterator] === 'function') {
      for (var i = 0; i < item.length; i++) {
        this.showResponses[item[i]] = response;
      }
    }
  }
}

class Room {
  constructor(items, desc, name, exits = [], prop = { sitting: false, onEnter: false, onFirstEnter: false, leave: false, leaveMsg: true }, light = true) {
    this.items = items;
    this.exits = exits;
    this.desc = desc;
    this.name = name;
    this.prop = prop;
    this.light = light;
    try {
      this.exitLength = exits.map((value) => value !== null).length || 0;
    } catch (e) { this.exitLength = 0; }
  }
  makeExit(dir, to) {
    if (this.exits[dir]) {
      this.exits[dir].exits[reverse(dir)] = null;
    }
    this.exits[dir] = to;
    try {
      this.exitLength = this.exits.map((value) => value !== null).length;
    } catch (e) { this.exitLength = 0; }
  }
  makeBothExit(dir, room) {
    this.makeExit(dir, room);
    room.makeExit(reverse(dir), this);
  }
  copy() {
    return new Room(this.items, this.desc, this.name, this.exits, this.prop, this.light);
  }
}

class Command {
  constructor(cmds, run, desc) {
    this.cmds = cmds;
    this.run = run;
    this.desc = desc;
  }
}

class Timer {
  constructor(start, turns, endFunc, tickFunc) {
    this.start = start;
    this.turns = turns;
    this.endFunc = endFunc;
    this.tickFunc = tickFunc;
  }
}

class Clue {
  constructor(message, pointValue) {
    this.message = message;
    this.pointValue = pointValue;
  }
}

class LogItem {
  constructor(message, source, level) {
    this.message = message;
    this.source = source;
    this.level = level;
  }
  toString() {
    return `[${this.level}] [${this.source}] ${this.message}`;
  }
}

class CommandLogItem extends LogItem {
  constructor(fullCommand) {
    this.fullCommand = fullCommand;
  }
  toString() {
    return `[INFO] [world] Executing command "${this.fullCommand}"...`;
  }
}

class InCommandLogItem extends CommandLogItem {
  constructor(message, command, level) {
    this.message = message;
    this.command = command;
    this.level = level;
  }
  toString() {
    return `[${this.level}] [${this.command}] ${this.message}`;
  }
}


function dirtonum(dir) {
  dir = dir.toLowerCase();
  if (dir === "n" | valid(dir, "north", 2)) {
    return Location.North;
  } else if (dir === "e" | valid(dir, "east", 2)) {
    return Location.East;
  } else if (dir === "s" | valid(dir, "south", 2)) {
    return Location.South;
  } else if (dir === "w" | valid(dir, "west", 2)) {
    return Location.West;
  } else {
    return Location.Unknown;
  }
}

function reverse(dir) {
  dir = standardize(dir);
  if (dir == "north") {
    return Location.South;
  } else if (dir == "south") {
    return Location.North;
  } else if (dir == "east") {
    return Location.West;
  } else if (dir == "west") {
    return Location.East;
  } else {
    return Location.Unknown;
  }
}

function standardize(dir) {
  try {
    dir = dir.toLowerCase();
  } catch (e) { }
  if (dir === "n" | dir === "north" | dir === Location.North) {
    return "north";
  } else if (dir === "e" | dir === "east" | dir === Location.East) {
    return "east";
  } else if (dir === "s" | dir === "south" | dir === Location.South) {
    return "south";
  } else if (dir === "w" | dir === "west" | dir === Location.West) {
    return "west";
  } else {
    return "unknown";
  }
}

function numtodir(dir) {
  if (dir === Location.North) {
    return "north";
  } else if (dir === Location.East) {
    return "east";
  } else if (dir === Location.South) {
    return "south";
  } else if (dir === Location.West) {
    return "west";
  } else {
    return "unknown";
  }
}

function go(world, inp) {
  if (valid(inp[0], "in", 1)) {
    inp = inp.splice(0, 1);
    enter(inp);
  }
  if (world.current_room.prop.sitting) {
    print("You give a valiant effort, but you need to stand up first.", "", world);
    return;
  }
  var leaveMsg = world.current_room.prop.leaveMsg;
  try {
    world.prevRoom = world.current_room;
    if (world.current_room.exits[dirtonum(inp[0])]) {
      //print(world.current_room.exits[dirtonum(inp[0])].toString(),"")
      world.current_room = world.current_room.exits[dirtonum(inp[0])];
      if (world.current_room.prop.onEnter instanceof Function) {
        world.current_room.prop.onEnter(world);
      }
      if (!world.visited.includes(world.current_room)) {
        if (world.current_room.prop.onFirstEnter instanceof Function) {
          world.current_room.prop.onFirstEnter(world);
        }
        look(world, []);
        world.visited.push(world.current_room);
      } else if (leaveMsg) {
        print(world.current_room.name, '', world);
      }
    } else {
      if (leaveMsg) {
        print(`You attempt to go ${standardize(inp[0])} but run into a wall.`, "", world);
      }
    }
    if (world.prevroom.prop.leave instanceof Function) {
      world.prevroom.prop.leave(world, standardize(inp[0]));
    }
  } catch (e) {
    print(e.toString(), "color: white", world);
    if (leaveMsg) {
      print(`You attempt to go ${standardize(inp[0])} but run into a wall.`, "", world);
    }
  }
}

function gon(world, inp) {
  go(world, "n");
}
function gos(world, inp) {
  go(world, "s");
}
function goe(world, inp) {
  go(world, "e");
}
function gow(world, inp) {
  go(world, "w");
}

function look(world, inp) {
  if (inp[0] == "under") {
    inp = inp.splice(0, 1);
    var v;
    for (var i = 0; i < world.current_room.items.length; i++) {
      v = world.current_room.items[i];
      if (valid(v.name, inp[0], v.name.length - 1)) {
        try {
          if (v.prop.under instanceof Function) {
            v.prop.under(world);
            return;
          } else {
            break;
          }
        } catch (e) {
          print(`Please report this internal error: ${e.toString()}`, "", world);
        }
      }
    }
    print("There's nothing under there.", "", world);
    return;
  }
  Logger.log(world.current_room);
  print("    " + world.current_room.name, "", world);
  print(world.current_room.desc, "", world);
  for (var f = 0; f < world.current_room.items.length; f++) {
    if (!world.current_room.items[f].hidden) {
      print(world.current_room.items[f].name + " - " + world.current_room.items[f].sdesc, "", world);
    }
  }
  var dirs = [];
  for (var g = 0; g < world.current_room.exits.length; g++) {
    if (world.current_room.exits[g] !== null) {
      if (g == world.current_room.exits.length - 1) {
        dirs.push('and ' + standardize(g) + '.');
      }
      dirs.push(standardize(g) + ', ');
    }
  }
  print("There are exit(s) to the " + dirs.toString(), "", world);
}

function examine(world, inp) {
  for (var i = 0; i < world.current_room.items.length; i++) {
    if (valid(world.current_room.items[i].name, inp[0], world.current_room.items[i].name.length - 1)) {
      world.lastExamined = world.current_room.items[i];
      print(world.current_room.items[i].ldesc, "", world);
      if (world.current_room.items[i].prop.onExamine && world.current_room.items[i].prop.onExamine instanceof Function) {
        world.current_room.items[i].prop.onExamine(world, world.current_room.items[i]);
      }
      return;
    }
  }
}

function pickup(world, inp) {
  var v;
  for (var i = 0; i < world.current_room.items.length; i++) {
    v = world.current_room.items[i];
    if (valid(v.name, inp[0], v.name.length - 1)) {
      try {
        if (v.prop.pickup) {
          if (world.curWeight + v.weight < world.maxWeight) {
            world.inv.push(v);
            world.curWeight += v.weight;
            world.current_room.items.splice(i, 1);
            if (v.prop.pickup instanceof Function) {
              v.prop.pickup(world);
            }
          } else {
            print("Your load is too heavy. Maybe drop something?", "", world);
            return;
          }
          return;
        } else {
          print("You give a mighty heave, but it won't budge.", "", world);
          return;
        }
      } catch (e) {
        world.inv.push(v);
        world.current_room.items.splice(i, 1);
        return;
      }
    }
  }
  print("That item isn't in the current room. Are you trying to summon it or something?", "", world);
}

function enter(world, inp) {
  var v;
  for (var i = 0; i < world.current_room.items.length; i++) {
    v = world.current_room.items[i];
    if (valid(v.name, inp[0], v.name.length - 1)) {
      try {
        if (v.prop.enter instanceof Function) {
          v.prop.enter(world);
          return;
        } else {
          break;
        }
      } catch (e) {
        print(`Please report this internal error: ${e.toString()}`, "", world);
      }
    }
  }
  print("And how would you do that?", "", world);
}

function invl(world, _inp) {
  print("Your inventory:", "", world);
  for (var i = 0; i < world.inv.length; i++) {
    print("" + world.inv[i].name + " - " + world.inv[i].sdesc + "", "", world);
  }
}

function drop(world, inp) {
  var v;
  for (var i = 0; i < world.inv.length; i++) {
    v = world.inv[i];
    if (valid(v.name, inp[0], v.name.length - 1)) {
      world.current_room.items.push(v);
      world.curWeight -= v.weight;
      world.inv.splice(i, 1);
      print("Ok.", "", world);
      return;
    }
  }
  print("Why are you trying to drop something that you don't have?", "", world);
}

function useroom(world, inp) {
  var v;
  for (var i = 0; i < world.current_room.items.length; i++) {
    v = world.current_room.items[i];
    if (valid(v.name, inp[0], v.name.length - 1)) {
      if (v.prop.use && v.prop.useroom) {
        v.prop.use(world);
        if (v.prop.consume) {
          world.inv.splice(i, 1);
        }
        return;
      } else {
        print("I don't want to know what your trying to use that for.", "", world);
        return;
      }
    }
  }
  print("Why are you trying to use a item that doesn't exist?", "", world);
}

function use(world, inp) {
  var v;
  for (var i = 0; i < world.inv.length; i++) {
    v = world.inv[i];
    if (valid(v.name, inp[0], v.name.length - 1)) {
      if (v.prop.use !== false) {
        v.prop.use(world);
        if (v.prop.consume) {
          world.inv.splice(i, 1);
        }
        return;
      } else {
        print("I don't want to know what your trying to use that for.", "", world);
        return;
      }
    }
  }
  useroom(world, inp);
}

function help(world, inp) {
  print("\"Missing\" is a mystery adventure in which people are going missing and they've called on you, the world's greatest detective, to recover them and discover who the kidnapper is.", "", world);
}

function refReplacer() {
  let m = new Map(), v = new Map(), init = null;

  return function (field, value) {
    let p = m.get(this) + (Array.isArray(this) ? `[${field}]` : '.' + field);
    let isComplex = value === Object(value);

    if (isComplex) m.set(value, p);

    let pp = v.get(value) || '';
    let path = p.replace(/undefined\.\.?/, '');
    let val = pp ? `#REF:${pp[0] == '[' ? '$' : '$.'}${pp}` : value;

    !init ? (init = value) : (val === init ? val = "#REF:$" : 0);
    if (!pp && isComplex) v.set(value, path);

    return val;
  };
}

function parseRefJSON(json) {
  let objToPath = new Map();
  let pathToObj = new Map();
  let o = JSON.parse(json);

  let traverse = (parent, field) => {
    let obj = parent;
    let path = '#REF:$';

    if (field !== undefined) {
      obj = parent[field];
      path = objToPath.get(parent) + (Array.isArray(parent) ? `[${field}]` : `${field ? '.' + field : ''}`);
    }

    objToPath.set(obj, path);
    pathToObj.set(path, obj);

    let ref = pathToObj.get(obj);
    if (ref) parent[field] = ref;

    for (let f in obj) if (obj === Object(obj)) traverse(obj, f);
  };

  traverse(o);
  return o;
}

function testFormat(text) {
  try {
    var o = JSON.parse(atob(text));

    // Handle non-exception-throwing cases:
    // Neither JSON.parse(false) or JSON.parse(1234) throw errors, hence the type-checking,
    // but... JSON.parse(null) returns null, and typeof null === "object",
    // so we must check for that, too. Thankfully, null is falsey, so this suffices:
    if (o && typeof o === "object") {
      return true;
    }
  }
  catch (e) { }

  return false;
}

function save(world, inp) {
  if (inp.length < 1) {
    inp.push(new Date().toString());
  }
  var encoded = btoa(JSON.stringify(world.current_room, refReplacer()));
  world.saves.createFile(inp.join(" "), encoded);
  print("Ok.", "", world);
}

function load(world, inp) {
  if (inp.length < 1) {
    print("Expected the form of 'load <save>'!", "color: red", world);
    return;
  }
  var data = world.saves.getFilesByName(inp.join(" ")).next().getBlob().getDataAsString();
  try {
    if (!testFormat(data)) {
      throw "invalid format";
    }
  } catch (e) {
    print("Error: either invalid format or nonexistant save!", "color: red;", world);
    return;
  }
  var object = parseRefJSON(atob(data));
  world.current_room = object;
  print("Ok.", "", world);
}

function listSaves(world, inp) {
  print("Saves: ", "", world);
  var folders = world.saves.getFiles();
  while (folders.hasNext()) {
    print(folders.next().getName(), "", world);
  }
}

function removeSave(world, inp) {
  try {
    world.saves.getFilesByName(inp.join(" ")).next().setTrashed(true);
  } catch (e) {
    print("There's no save with that name, or you've already deleted that save!", 'color: red', world);
  }
  print("Ok.", "", world);
}

function stand(world, _inp) {
  if (!world.current_room.prop.sitting) {
    print("You're not sitting down!", "color: red", world);
    return;
  }
  if (!(world.current_room.prop.sitting instanceof Room)) {
    print("Internal error: typeof world.current_room.prop.sitting != Room", "color: red", world);
    return;
  }
  world.current_room = world.current_room.prop.sitting;
  world.points++;
  print("Ok.", "", world);
  look(world, []);
}

function sit(world, _inp) {
  print("This is no time to sit down!", "", world);
}

function show(world, inp) {
  var item = null;
  for (var i = 0; i < world.inv.length; i++) {
    if (valid(world.inv[i].name, inp[0], world.inv[i].length - 1)) {
      item = world.inv[i];
      break;
    }
  }
  if (!item) {
    print("You don't have that item.", "", world);
    return;
  }
  var person = null;
  for (var f = 0; f < world.current_room.items.length; f++) {
    if (valid(world.items[f].name, inp[1], world.current_room.items[f].length - 1) && world.current_room.items[f] instanceof Person) {
      person = world.current_room.items[f];
      break;
    }
  }
  if (!person) {
    print("That person isn't in the room.", "", world);
    return;
  }
  try {
    if (person.showResponses[item] instanceof String) {
      print(person.showResponses[item], "", world);
      return;
    }
    person.showResponses[item](world);
  } catch (e) {
    print(e.toString(), "color: white", world);
    print(`The ${inp[2]} is unimpressed.`, "", world);
  }
}

function talk(world, inp) {
  var person = null;
  for (var i = 0; i < world.current_room.items.length; i++) {
    if (valid(world.items[i].name, inp[0], world.current_room.items[i].length - 1) && world.current_room.items[i] instanceof Person) {
      person = world.current_room.items[i];
      break;
    }
  }
  if (!person) {
    print("That person isn't in the room.", "", world);
    return;
  }
  try {
    for (var f = 0; f < person.dialog.keys().length; f++) {
      if (person.dialog.keys()[f] instanceof RegExp) {
        try {
          if (inp.match(person.dialog.keys()[f]).length > 0) {
            if (person.dialog[f] instanceof String) {
              print(person.dialog[f], "", world);
              return;
            }
            person.dialog[f](world);
          }
        } catch (e) { }
      }
    }
    if (person.dialog[inp[1]] instanceof String) {
      print(person.dialog[inp[1]], "", world);
      return;
    }
    person.dialog[inp[1]](world);
  } catch (e) {
    print(e.toString(), "color: white", world);
    print(`The ${inp[2]} is unimpressed.`, "", world);
  }
}

function clues(world, _inp) {
  print("Your clues:", "", world);
  for (var i = 0; i < world.clues.length; i++) {
    print(`Clue #${i + 1}: ${world.clues[i].message}`, "", world);
  }
}

function arrest(world, inp) {
  var person = null;
  for (var f = 0; f < world.current_room.items.length; f++) {
    if (valid(world.items[f].name, inp[0], world.items[f].length - 1) && world.current_room.items[f] instanceof Person) {
      person = world.current_room.items[f];
      break;
    } else if (valid(world.items[f].name, inp[0], world.items[f].length - 1)) {
      print("You can't arrest an inanimate object!", "", world);
      return;
    }
  }
  if (!person) {
    print("That person isn't in the room!", "", world);
    return;
  }
  if (person.prop.arrest instanceof Function) {
    person.prop.arrest(world);
  }
}

var globalcmds = [
  new Command(["go", "move", 'g'], go, "Move in a direction"),
  new Command(["north", "n"], gon, "Go north"),
  new Command(["south", "s"], gos, "Go south"),
  new Command(["east", "e"], goe, "Go east"),
  new Command(["west", "w"], gow, "Go west"),
  new Command(["look", 'l'], look, "Look around the room"),
  new Command(["examine", "read", 'x'], examine, "Examine an object"),
  new Command(["get", "pick up", "grab"], pickup, "Get an object"),
  new Command(["inventory", "inv", 'i'], invl, "List the objects in your inventory"),
  new Command(["drop", "yeet"], drop, "Drop an item in your inventory"),
  new Command(["use", "activate", "eat", "open", "unlock", "light"], use, "Use an item"),
  new Command(["help", "info"], help, "Show information on the game"),
  new Command(["save"], save, "Save the game. This does overwrite a save if it exists, so check with the \"list\" command"),
  new Command(["load"], load, "Load a save"),
  new Command(["saves", "list"], listSaves, "List the saves"),
  new Command(["delete", "remove"], removeSave, "Remove a save. There's no confirmation, so be careful!"),
  new Command(['stand', 'stand up'], stand, "Stand up"),
  new Command(["sit down", "sit"], sit, "Sit down"),
  new Command(["verbose"], (world, _inp) => print("Sorry, there is no verbose mode. If you want me to add it, let me know by emailing me at this email in a different conversation.", "", world), "The non-existant verbose mode"),
  new Command(["wait", 'z'], (world, _inp) => print("You wait a while.", '', world), "Wait a turn"),
  new Command(["enter", "leave"], enter, "Enter something"),
  new Command(["show"], show, "Show a person an item"),
  new Command(["talk", "ask"], talk, "Talk to a person"),
  new Command(["clues"], clues, "The clues"),
  new Command(["arrest"], arrest, "Arrest someone")
];

class World {
  constructor(sroom, email, commands = globalcmds) {
    this.current_room = sroom;
    if (commands[0] === "globalcmds") {
      commands.splice(0, 1);
      for (var i = 0; i < globalcmds.length; i++) {
        commands.push(globalcmds[i]);
      }
    }
    this.commands = commands;
    this.email = email;
    this.emailCache = [];
    var saves = DriveApp.getFolderById("1R466Y54FgRnSw6F-WS4uJSPiGfCNbmm3");
    var savesFolder = null;
    try {
      savesFolder = saves.getFoldersByName(email).next();
    }
    catch (e) {
      savesFolder = saves.createFolder(email);
    }
    this.saves = savesFolder;
    this.inv = [];
    this.visited = [];
    this.points = 0;
    this.totalPoints = 10;
    this.clues = [];
    this.turns = 0;
    this.timers = [];
    this.light = false;
    this.prevroom = this.current_room;
    this.log = [];
    this.lastExamined = null;
  }

  __parse(inp) {
    const origInp = inp;
    this.emailCache = [];
    //print("yes","color: red");
    //print(inp,"");
    print(`${this.current_room.name}\t ${this.points}/${this.totalPoints} ${this.points == 1 ? "point" : "points"}`, "text-align: center", this);
    print("&gt; " + inp + "", '', this);
    inp = inp.replace(/[\!\@\#\$\%\^\&\*\(\)\-\_\=\+\[\{\}\]\|\'\"\;\:\/\?\.\>\,\\<\`\~\\]*/g, "").toLowerCase();
    Logger.log(inp);
    this.turns++;
    this.log.push(new LogItem(`Starting execution of turn #${this.turns}...`, "world", "INFO"));
    //print(inp[0].toLowerCase(),"color: red");
    for (var i = 0; i < this.commands.length; i++) {
      //print(inp[0].toLowerCase() in globalcmds[i].cmds,"color: red");
      this.log.push(new LogItem(`Testing command "${this.commands[i].cmds[0]}" to match ${origInp}...`, "world", "INFO"));
      try {
        for (var f = 0; f < this.commands[i].cmds.length; f++) {
          this.log.push(new LogItem(`Testing command "${this.commands[i].cmds[0]}"'s alias ${this.commands[i].cmds[f]} to match ${origInp}...`, "world", "INFO"));
          if (inp.startsWith(this.commands[i].cmds[f])) {
            inp = inp.replace(this.commands[i].cmds[f]).trim();
            inp = inp.split(" ");
            try {
              this.log.push(new CommandLogItem(origInp));
              this.commands[i].run(this, inp);
            } catch (e) {
              this.log.push(new LogItem(`Internal error: ${e}`, "world", "ERROR"));
              print(`Internal error '${e}' in command '${this.commands[i].cmds[0]}'; please report this to the same email address in a seperate email. Also include the log, which follows:`, "", this);
              print(`LOG:<br>${this.log.join("\n")}`);
              this.log.push(new LogItem(`Sending email of turn #${this.turns + 1}...`, "world", "INFO"));
              send(this);
              this.log.push(new LogItem(`Finished execution of turn #${this.turns + 1}!`, "world", "INFO"));
              return;
            }
            //print("yee","color: red");
            this.log.push(new LogItem(`Command "${this.commands[i]}" execution successful! Begining execution of timers...`, "world", "INFO"));
            for (var g = 0; g < this.timers.length; g++) {
              var v = this.timers[g];
              if (v instanceof Timer) {
                this.log.push(new LogItem(`Testing timer #${g} for if it has ended...`, "world", "INFO"));
                if (this.turns == v.start + v.turns) {
                  this.log.push(new LogItem(`Timer has ended! Activating end function and removing timer from timer list...`, "world", "INFO"));
                  v.endFunc(this);
                  this.timers.splice(g, 1);
                } else {
                  this.log.push(new LogItem(`Timer has not ended! Activating tick function...`, "world", "INFO"));
                  v.tickFunc(this);
                }
              }
            }
            this.log.push(new LogItem(`Sending email of turn #${this.turns}...`, "world", "INFO"));
            send(this);
            this.log.push(new LogItem(`Finished execution of turn #${this.turns}!`, "world", "INFO"));
            return;
          }
        }
      } catch (e) {
        this.turns--;
        this.log.push(new LogItem(`Internal error: ${e}`, "world", "ERROR"));
        print(`Internal error '${e}' in command '${this.commands[i].cmds[0]}'; please report this to the same email address in a seperate email. Also include the log, which follows:`, "", this);
        print(`LOG:<br>${this.log.join("\n")}`);
        this.log.push(new LogItem(`Sending email of turn #${this.turns + 1}...`, "world", "INFO"));
        send(this);
        this.log.push(new LogItem(`Finished execution of turn #${this.turns + 1}!`, "world", "INFO"));
        return;
      }
    }
    this.turns--;
    if (inp[0] !== "") {
      this.log.push(new LogItem(`Input is not empty and is an invalid command!`, "world", "INFO"));
      print(`The command \"${inp[0]}\" doesn't exist! Type \"help\" for a list of commands.`, "color: red", this);
    }
    this.log.push(new LogItem(`Sending email of turn #${this.turns + 1}...`, "world", "INFO"));
    send(this);
    this.log.push(new LogItem(`Finished execution of turn #${this.turns + 1}!`, "world", "INFO"));
  }

}

class Game extends World {
  constructor(email, gameJson) {
    super(start, email, ["globalcmds"]);
    var normalCommands = globalcmds;
    var that = this;
    var world = that;
    this.emailCache = []; // please work...

    function makeDark(room, world = that) {
      if (!world.light && !world.current_room.light) {
        room.desc = "You are in a dark room, unable to see.";
        room.name = "A dark room";
        room.items = [];
        room.prop = { leave: (world) => { if (world.prevRoom == world.current_room) { print("Bumbling around in the dark, you hit a wall.", "", world) } else { print("Bumbling around in the dark, you manage to stumble through a door.", "", world) } }, leaveMsg: false };
      }
      return room;
    }

    var farranClue = new Clue("A scuffle in the Farran house cellar", 2);
    var factoryClue = new Clue("Mr. Farran being kidnapped before he could turn in a design for a new locomotive", 2);
    var apartmentsClue = new Clue("A note saying that someone was taken to \"The plant\"", 3);
    var finishedClue = new Clue("You finishing the game!", 3);

    var carrageItem = new Item("carrage", "A carrage", "A carrage that can take you around the city", 20, { use: carrage, consume: false, pickup: false, useroom: carrage, enter: carrage });

    var painting = new Item("painting", "A painting.", "A painting. It appears to protray a lady, although it is somewhat damaged.", 3, { use: false, consume: false, pickup: false, useroom: false });

    var peopleList = new Item("paper", "A piece of paper with a list of people who went missing.", "A piece of paper with a list of people who went missing. You skim the list, occassionally seeing a familiar name. You reach the end quickly and tell Eli, \"This is bad. Why haven't I heard of this before?\" Before he can respond, you respond to yourself and say, \"Nevermind. Let's go to their houses and check out the evidence.\"", 0.5, { onExamine: (_world, item) => { item.ldesc = "The piece of paper with the list of names. It is (currently) unnecessary." } });

    var chair = new Item("chair", "A battered chair", "Your battered chair. You inherited it from your father and it is very important to you.", 5, { use: false, consume: false, pickup: false, useroom: false });

    var stove = new Item("stove", "A stove", "A old, wood stove", 20, { use: (world) => print("You have no need to use the stove right now.", "", world), consume: false, pickup: false, useroom: (world) => print("You have no need to use the stove right now.", "", world) });

    var rug = new Item("rug", "A rug", "A bear-skin rug. There is nothing special about it.", 20, { pickup: false });

    function torchEnd(world) {
      world.inv.splice(world.inv.indexOf(torch), 1);
      world.inv.push(burntTorch);
      world.light = false;
      world.current_room = makeDark(world.current_room, world);
      print("Your torch goes out.", "", world);
    }
    function torchTick(world) {
      torch.ldesc = `The torch is burning, and looks like it will go for about ${torchTimer.turns - (world.turns - torchTimer.start)} turns longer.`;
    }

    var torchTimer = new Timer(world.turns, 20, torchEnd, torchTick);
    var torch = new Item("torch", "A torch, not currently burning", "The torch is not burning, and looks like it will go for about 20 turns if you light it.", 1, { pickup: true, consume: false, use: (world) => { world.timers.push(torchTimer); torch.sdesc = "A torch, currently burning."; world.light = true; print("You light the torch.", "", world) } });
    var burntTorch = new Item("burnt-out torch", "A burnt-out torch.", "A burnt-out torch, essentially a stick with some charcoal on top. It is also slightly lighter.", 0.9, { pickup: true, consume: false, use: false, useroom: false });

    function openCellar(world) {
      cellar.sdesc = "The entrance to the cellar. It is unlocked and open.";
      cellar.ldesc = "The cellar entrance is open. You can go through it.";
      cellar.prop.unlocked = true;
      world.current_room.makeExit(Location.North, farranHouseCellar);
      print("You unlock and open the cellar entrance.", "", world);
    }

    function cellarFunc(world) {
      var v;
      for (var i = 0; i < world.inv.length; i++) {
        v = world.inv.items[i];
        if (v.name === "cellar key") {
          try {
            openCellar(world);
          } catch (e) {
            print("Please report this internal error of opening the cellar: " + e.toString(), "", world);
          }
        }
      }
    }

    var cellar = new Item("cellar entrance", "The entrance to the cellar. It appears to be locked.", "The cellar entrance appears to be locked, although you might be able to pry the door open with a crowbar.", 20, { use: cellarFunc, consume: false, pickup: false, useroom: cellarFunc, enter: cellarFunc });

    var cellarKey = new Item("cellar key", "The key to the cellar", "The key to the cellar. It is a small key, a perfect fit to be hidden under the welcome mat.", 0.5);

    var welcomeMat = new Item("welcome mat", "A normal welcome mat", "A welcome mat, saying \"Welcome to the house!\"", 1, { pickup: (world) => { world.current_room.items.push(cellarKey); print("As you pickup the mat, you notice a key beneath it.", "", world) } });

    var outsideFarranHouse = new Room([carrageItem, welcomeMat], "You’re outside the Farran house, a beautiful house whose owners, the Farrans, were among the first kidnapped.", "Outside the Farran House", [], { leave: (world) => { if (world.prevroom == world.current_room) { print("It's faster to take the carrage.", "", world) } }, leaveMsg: false });

    var inFarranHouse = new Room([painting], "The entryway of the Farran house.", "The Farran House's Entryway");

    var farranHouseHallway = new Room([painting, painting], "The main hallway of the Farran House.", "Farran House Hallway");

    var farranHouseKitchen = new Room([stove, cellar], "The Farran house kitchen", "Farran House Kitchen");

    var farranHouseCellar = new Room([torch], "A dark and slightly damp cellar.", "The Farran House Cellar");

    var coldBox = new Item("cold box", "A normal cold box", "A normal cold box, used to store food and keep it cold.", 15);
    var farranHouseCellarBack = new Room([coldBox], "You see signs of a scuffle back here. There is a streak of blood leading back to where you came, and some of the food from the ice box was knocked out.", "Back of the Farran House Cellar", [], { onFirstEnter: (world) => { world.points++; world.clues.push(farranClue); world.points += farranClue.pointValue; print("You got a clue! List your clues with 'clues'.", "", world) } }, false);

    var farranHouseMainRoom = new Room([painting], "The main room of the Farran House.", "Farran House Main Room");

    var locomotiveDesign = new Item("locomotive design", "A design for a new type of gasoline locomotive", "You look at the design and attempt to make sense of the lines and squiggles, but fail. Maybe you could find someone who understands it?", 0.5);

    var desk = new Item("desk", "A basic desk", "Mr. Farran's desk. There isn't anything special about it.", 20, { pickup: false, use: (world) => { print("You quickly rifle through Mr. Farran's desk and find some papers about a new design for a gasoline locomotive.", "", world); world.inv.push(locomotiveDesign) }, useroom: (world) => { print("You quickly rifle through Mr. Farran's desk and find some papers about a new design for a gasoline locomotive.", "", world); world.inv.push(locomotiveDesign) } });

    var farranHouseStudy = new Room([painting, desk], "A basic study.", "The Farran House Study");

    function shedLeave(world) {
      world.current_room = farranHouseYard;
      print("You leave the shed.", "", world);
    }

    var hiddenShed = new Item("shed", "A totally empty room", "A totally empty room with nothing to do", 20, { pickup: false, enter: shedLeave, hidden: true });
    var insideShed = new Room([hiddenShed], "A totally empty room. There is nothing to do here.", "The Empty Shed", []);
    function shedEnter(world) {
      world.current_room = insideShed;
      print("You enter the shed.", "", world);
    }

    var shed = new Item("shed", "A unremarkable shed", "Perhaps it was once a garden shed? Who knows.", 20, { pickup: false, enter: shedEnter });

    var farranHouseYard = new Room([shed], "The Farran house's backyard.", "Farran House Backyard", []);

    outsideFarranHouse.makeExit(Location.East, inFarranHouse);
    inFarranHouse.makeExit(Location.West, outsideFarranHouse);
    inFarranHouse.makeExit(Location.East, farranHouseHallway);
    farranHouseHallway.makeExit(Location.West, inFarranHouse);
    farranHouseHallway.makeExit(Location.North, farranHouseKitchen);
    farranHouseHallway.makeExit(Location.South, farranHouseMainRoom);
    farranHouseHallway.makeExit(Location.East, farranHouseStudy);
    farranHouseKitchen.makeExit(Location.South, farranHouseHallway);
    farranHouseCellar.makeExit(Location.South, farranHouseCellarBack);
    farranHouseCellarBack.makeExit(Location.North, farranHouseCellar);
    farranHouseMainRoom.makeExit(Location.North, farranHouseHallway);
    farranHouseStudy.makeExit(Location.West, farranHouseHallway);
    farranHouseStudy.makeExit(Location.East, farranHouseYard);
    farranHouseYard.makeExit(Location.West, farranHouseStudy);
    insideShed.makeExit(Location.North, farranHouseYard);

    var managerChair = new Item("office chair", "The manager's chair", "The manager's office chair.", 20, { pickup: false });
    var factoryDesk = new Item("the manager's desk", "The manager's desk", "The manager's desk, a relatively nice desk made out of a nice wood.", 20, { pickup: false });

    var manager = new Person("manager", "The locomotive factory's manager", "The locomotive factory's manager, who founded the company.", 20, { pickup: false });
    function designResponse(world) {
      world.clues.push(factoryClue);
      world.points += factoryClue.pointValue;
      print("Manager> Hmm. This design is from Mr. Farran, you say? He is one of our best designers. Do you think that he drafted this design right before he was kidnapped, and one of our competitors caught wind of it and kidnapped him?", "", world);
      print("You got a clue! List your clues with 'clues'.", "", world);
    }
    manager.addShowResponse(locomotiveDesign, designResponse);
    manager.addDialog("weather", (world) => { print("I suppose so.", "", world) });

    var locomotive = new Item("half-built locomotive", "A half-built locomotive", "A partially built locomotive, being actively worked on.", 2000, { pickup: false });

    var outsideFactory = new Room([carrageItem], "You’re outside the locomotive factory, a not-so-beautiful factory where a majority of the kidnapped worked.", "Outside the Locomotive Factory", [], { leave: (world) => { if (world.prevroom == world.current_room) { print("It's faster to take the carrage.", "", world) } }, leaveMsg: false });

    var factoryEntrance = new Room([rug], "The only hallway in the factory.", "Locomotive Factory Entrance", []);

    var factoryOffice = new Room([managerChair, factoryDesk, manager], "The manager of the factory's office", "Locomotive Factory Office", []);

    var factoryMainRoom = new Room([locomotive, locomotive], "A big, wide open room for making locomotives.", "Locomotive Factory Main Room", []);

    outsideFactory.makeExit(Location.North, factoryEntrance);
    factoryEntrance.makeExit(Location.South, outsideFactory);
    factoryEntrance.makeExit(Location.West, factoryOffice);
    factoryEntrance.makeExit(Location.North, factoryMainRoom);
    factoryOffice.makeExit(Location.East, factoryEntrance);
    factoryMainRoom.makeExit(Location.South, factoryEntrance);

    var outsidePostOffice = new Room([carrageItem], "You're outside the post office, a squat building that everyone in the town is familiar with, as everyone has mail.", "Outside the Post Office", [], { leave: (world) => { if (world.prevroom == world.current_room) { print("It's faster to take the carrage.", "", world) } }, leaveMsg: false });

    var postManager = new Person("manager", "The post office's manager", "The post office's manager, who is under paid and always a bit grumpy.", 20, { pickup: false });
    var postManagerDialogLimit = 9;
    var postManagerDialog = 0;
    postManager.addDialog(["missing", "kidnappings"], (world) => { if (postManagerDialog != postManagerDialogLimit) { postManagerDialog++; print("Post Office Manager> Harrumph. All the less people to bother me.", "", world); } else { print("Post Office Manager> Go away.") } });
    postManager.addDialog("money", (world) => { if (postManagerDialog != postManagerDialogLimit) { postManagerDialog++; print("Post Office Manager> I would move out of this town, if only I had the money.", "", world) } else { print("Post Office Manager> Go away.") } });
    postManager.addDialog(["wife", "spouse"], (world) => { if (postManagerDialog != postManagerDialogLimit) { postManagerDialog++; print("Post Office Manager> Nope. Not for me.", "", world); } else { print("Post Office Manager> Go away.") } });

    var endKey = new Item("key", "A large key", "You are unsure about what it is for.", 0.7);

    var bench = new Item("bench", "A regular bench", "A regular bench, often found in post offices.", 20, { pickup: false, under: (world) => { world.inv.push(endKey); print("You look under the bench and find a cool-looking key.", "", world) } });

    var inPostOffice = new Room([postManager, rug, bench, bench], "The inside of the post office. There isn't anything special about it.", "Inside the Post Office", [], { onEnter: (_world) => { postManagerDialog = 0; postManagerDialogLimit--; } });

    outsidePostOffice.makeExit(Location.North, inPostOffice);
    inPostOffice.makeExit(Location.South, outsidePostOffice);

    var outsideApartments = new Room([carrageItem], "You're outside the apartments, a building that houses a good portion of the town.", "Outside the Apartments", [], { leave: (world) => { if (world.prevroom == world.current_room) { print("It's faster to take the carrage.", "", world) } }, leaveMsg: false });

    var plant = new Item("plant", "A small potted plant", "A small potted purple flower.", 2);

    var clerk = new Person("clerk", "An overworked, probably underpaid front-desk clerk", "A front-desk clerk who is likely overworked and underpaid.", 20);

    function clerkEnd(world) {
      inApartments.makeExit(Location.North, apartmentsFirstFloor);
      inApartments.items.splice(apartments.items.indexOf(clerk), 1);
      if (world.current_room == apartments) {
        print("Clerk> It's my break! Don't do anything stupid like sneaking up to the rooms!", "", world);
      }
    }

    var clerkTimer = new Timer(world.turns, 5, clerkEnd, (_world) => { });

    var inApartments = new Room([clerk, plant], "The inside/front desk of the apartment building.", "Front Desk of Apartments", [], { leave: (world, dir) => { if ((!clerkTimer.start + clerkTimer.turns >= world.turns) && dir === "north") { print("Clerk> Hey! You need a key to pass!", "", world) } }, onFirstEnter: (world) => { world.timers.push(clerkTimer) } });

    var unimportantApartment = new Room([plant, torch], "A relatively empty apartment.", "A apartment", []);
    var unimportantApartment2 = new Room([plant, torch], "A relatively empty apartment.", "A apartment", []);
    var unimportantApartment3 = new Room([plant, torch], "A relatively empty apartment.", "A apartment", []);
    var personApartment = new Room([], "A apartment with a person inside.", "A apartment", [], { onEnter: (world) => { print("Apartment owner> EEEK! What are you doing in here ?! Get out!", "", world); world.current_room = world.prevRoom } });
    var personApartment2 = new Room([], "A apartment with a person inside.", "A apartment", [], { onEnter: (world) => { print("Apartment owner> EEEK! What are you doing in here ?! Get out!", "", world); world.current_room = world.prevRoom } });

    var apartmentsFirstFloor = new Room([plant, plant, plant, plant], "A long hallway leading to all of the various apartment rooms.", "Apartments First Floor Hallway", [], {});
    apartmentsFirstFloor.makeExit(Location.South, inApartments);
    apartmentsFirstFloor.makeExit(Location.East, personApartment);
    personApartment.makeExit(Location.West, apartmentsFirstFloor);
    apartmentsFirstFloor.makeExit(Location.West, unimportantApartment);
    unimportantApartment.makeExit(Location.East, apartmentsFirstFloor);

    var apartmentsSecondFloor = new Room([plant, plant, plant], "A long hallway leading to all of the various apartment rooms.", "Apartments Second Floor Hallway", [], {});
    apartmentsSecondFloor.makeExit(Location.South, apartmentsFirstFloor);

    apartmentsSecondFloor.makeExit(Location.East, personApartment2);
    personApartment2.makeExit(Location.West, apartmentsSecondFloor);
    apartmentsSecondFloor.makeExit(Location.West, unimportantApartment2);
    unimportantApartment2.makeExit(Location.East, apartmentsSecondFloor);

    apartmentsFirstFloor.makeExit(Location.North, apartmentsSecondFloor);

    var apartmentsThirdFloor = new Room([plant, plant, plant], "A long hallway leading to all of the various apartment rooms.", "Apartments Second Floor Hallway", [], {});

    var importantNote = new Item("note", "A note with some writing on it", "It says \"Help! I'm being taken! I overheard them saying that their taking me to \"the plant.\" Help me...", 0.5, { onExamine: (world) => { carrageCommands.push(new Command(["plant"], plantBuilding, "")); havePlant = true; print("You immediately recognize the plant as the old chemical plant just outside town. You better get there, quick.", "", world); world.clues.push(apartmentsClue); world.points += apartmentsClue.pointValue; print("You got a clue! List your clues with \"clues\".", "", world) } });

    var importantApartment = new Room([plant, importantNote], "A relatively empty apartment.", "A apartment", []);

    apartmentsThirdFloor.makeExit(Location.South, apartmentsSecondFloor);

    apartmentsThirdFloor.makeExit(Location.West, importantApartment);
    importantApartment.makeExit(Location.East, apartmentsThirdFloor);
    apartmentsThirdFloor.makeExit(Location.West, unimportantApartment3);
    unimportantApartment3.makeExit(Location.East, apartmentsThirdFloor);

    apartmentsSecondFloor.makeExit(Location.North, apartmentsThirdFloor);

    outsideApartments.makeExit(Location.North, inApartments);
    inApartments.makeExit(Location.South, outsideApartments);

    var correctVats = [Math.floor(Math.random() * 5), Math.floor(Math.random() * 5), Math.floor(Math.random() * 5)];
    var numCorrect = 0;

    var plantDesk = new Item("the plant manager's old desk", "The plant manager's old desk", "The plantmanager's desk, a relatively nice old desk made out of a nice wood that has seen better days.", 20, { pickup: false });
    var plantMazeStart = new Room([], "You seem to be inside the walls of the plant. You can assume that this is a maze of sorts.", "Inside a wall of the plant", [], {}, false);
    var plantMazeBase = new Room([], "You seem to be inside the walls of the plant. You can assume that this is a maze of sorts.", "Inside a Wall of the Plant", [], {}, false);
    var plantMazeBaseRooms = [plantMazeBase.copy(), plantMazeBase.copy(), plantMazeBase.copy(), plantMazeBase.copy(), plantMazeBase.copy(), plantMazeBase.copy()];
    var plantMazeRooms = [];
    var arrow = new Item("an arrow", "An arrow pointing left", "A small arrow pointing left. If you try turning it, it reverts to pointing left.", 1);
    var plantMazeItems = [flashlight, plant, torch, arrow];
    for (var i = 0; i < Math.floor(Math.random() * plantMazeBaseRooms.length - 1) + 1; i++) {
      plantMazeBaseRooms[i].items.push(plantMazeItems[Math.floor(Math.random() * plantMazeItems.length)]);
    }
    function choice(array) {
      return array[Math.floor(Math.random() * array.length)];
    }
    var tempRoom;
    var tempRoom2;
    for (var f = 0; i < Math.floor(Math.random() * 80) + 20; i++) {
      tempRoom = choice(plantMazeBaseRooms);
      tempRoom2 = choice(plantMazeBaseRooms);
      tempRoom.makeBothExit(choice(Object.keys(Location).map(function (key) { return Location[key]; })), tempRoom2);
      plantMazeRooms.push(tempRoom, tempRoom2);
    }
    var chooseIndex = Math.floor(Math.random() * plantMazeRooms.length);
    while (plantMazeRooms[chooseIndex].exitLength === 0)
      chooseIndex = Math.floor(Math.random() * plantMazeRooms.length);
    plantMazeRooms[chooseIndex] = plantMazeEnd;
    plantMazeStart.makeBothExit(Location.West, choice(plantMazeRooms));
    var kidnapped1 = new Person("mr farran", "Mr. Farran", "The kidnapped Mr. Farran", 30, { pickup: false });
    kidnapped1.addDialog(/.*/, "Mr. Farran> I don't care! Just get me out of here!");
    kidnapped1.addShowResponse(/.*/, "Mr. Farran> I don't care! Just get me out of here!");

    var kidnapped2 = new Person("mrs farran", "Mrs. Farran", "The kidnapped Mrs. Farran", 30, { pickup: false });
    kidnapped1.addDialog(/.*/, "Mrs. Farran> I don't care! Just get me out of here!");
    kidnapped1.addShowResponse(/.*/, "Mrs. Farran> I don't care! Just get me out of here!");

    var kidnapped3 = new Person("mayor mann", "Mayor Mann", "The apparently kidnapped Mayor Mann", 30, { pickup: false });
    kidnapped1.addDialog(/.*/, "Mayor Mann> I don't care! Just get me out of here!");
    kidnapped1.addShowResponse(/.*/, "Mayor Mann> I don't care! Just get me out of here!");

    var arrested = 0;

    function kidnapperArrest(world) {
      arrested++;
      print("You arrest him.", "", world);
      if (arrested == 2) {
        print("You arrest the other one before leading them out of the maze and marking your path. You get the police to come and arrest them, before going back and freeing the hostages and leading them out to recover.", "", world);
        world.clues.push(finishedClue);
        world.points += finishedClue.pointValue;
        function explore(world, _inp) {
          print("Sorry, you can't explore yet. I want to make a new map for that and the new map is still a work in progress. If you sign up for updates though, you can get notified when it's finished.", "", world);
          //travel(world, endParlor);
        }
        function end(world, _inp) {
          print("Ok. Thank you for playing my game!", "", world);
          print(`Your final point score: ${world.points}/${world.totalPoints}`, "", world);
          print("If you change your mind about wanting to explore, then just run \"explore\".", "", world);
        }
        world.commands = [
          new Command(["explore"], explore, ""),
          new Command(["end"], end, "")
        ];
        print("You have beaten the game. You can explore the game(with the command \"explore\") or end the game(with the command \"end\")");
      }
    }

    var kidnapper1 = new Person("manager", "The post office manager", "The post office's manager, who you never would have suspected of being a kidnapper, especially not one with accompilces as he hates people so much.", 30, { pickup: false, arrest: kidnapperArrest });
    var kidnapper2 = new Person("unknown person", "An unknown person who you don't recognize", "A unknown person who is presumably the post office manager's accomplice.", 30, { pickup: false, arrest: kidnapperArrest });

    var pileOfMoney = new Item("a pile of money", "A gigantic pile of money", "A gigantic pile of money, towering above your head, almost to the ceiling.", 500, { pickup: false });

    function vaultTimerEnd(world) {
      vaultTimer.start = world.turns;
      world.timers.push(vaultTimer);
      print("They notice you and try to run, but you stop them until you can decide what to do with them.", "", world);
    }

    var vaultTimer = new Timer(this.turns, 2, vaultTimerEnd, (_world) => { });

    var insideVault = new Room([pileOfMoney, kidnapper1, pileOfMoney, kidnapper2, pileOfMoney], "Inside a gigantic vault", "Inside the Gigantic Vault", [], { onFirstEnter: (world) => { vaultTimer.start = world.turns; world.timers.push(vaultTimer) } }, false);

    function vaultEnter(world) {
      world.current_room = insideVault;
      if (!world.visited.includes(insideVault)) {
        look(world, []);
      }
    }
    var vault = new Item("vault", "A gigantic vault", "A gigantic vault that was probably originally intended to store the chemical plant's funds and profits.", 1000, { pickup: false, enter: vaultEnter });
    var plantMazeEnd = new Room([kidnapped1, kidnapped2, kidnapped3, vault], "A small-ish room that has the kidnapped person and a giant vault in the back.", "The Kidnapper's Hideout");
    function flashlightEnd(world) {
      world.inv.splice(world.inv.indexOf(flashlight), 1);
      world.inv.push(burntFlashlight);
      world.light = false;
      world.current_room = makeDark(world.current_room, world);
      print("Your flashlight flickers and goes out.", "", world);
    }
    function flashlightOff(world) {
      flashlight.sdesc = "A flashlight, not currently on";
      flashlight.ldesc = "The flashlight is not on.";
      world.timers.splice(world.timers.indexOf(flashlightTimer), 1);
      world.light = false;
      world.current_room = makeDark(world.current_room, world);
      flashlight.prop.remaining = flashlightTimer.turns - (flashlightTimer.start - world.turns);
      print("You switch off the flashlight.", "", world);
    }
    function flashlightTick(_world) {
    }

    var flashlightTimer = new Timer(world.turns, 100, flashlightEnd, flashlightTick);
    var flashlight = new Item("flashlight", "A flashlight, not currently on", "The flashlight is not on.", 1, { pickup: true, consume: false, use: (world) => { if (!world.timers.includes(flashlightTimer)) { flashlightTimer.turns = flashlight.prop.remaining; world.timers.push(flashlightTimer); flashlight.sdesc = "A flashlight, currently on"; flashlight.ldesc = "The flashlight is on."; world.light = true; print("You turn on the flashlight.", "", world) } else { flashlightOff(world) } }, remaining: 100 });
    var burntFlashlight = new Item("burnt-out flashlight", "A burnt-out flashlight.", "A burnt-out flashlight, essentially a expensive paperweight. It is also slightly lighter.", 0.9, { pickup: true, consume: false, use: false, useroom: false });
    var plantOffice = new Room([plantDesk, chair, flashlight], "A old, but still semi-lavish office that has a hole in one side.", "The Plant Manager’s Old Office");
    plantOffice.makeExit(Location.South, inPlant);
    plantOffice.makeExit(Location.West, plantMazeStart);

    var vat1 = new Item("vat 1", "A vat of chemicals labeled 'Vat 1'", "A large vat of hydrochloric acid that is at approximatly 2 feet currently. It also has a wheel on the side.", 50, { pickup: false, level: 2, number: 0, lastLevel: 2 });
    var vat2 = new Item("vat 2", "A vat of chemicals labeled 'Vat 2'", "A large vat of hydrochloric acid that is at approximatly 2 feet currently. It also has a wheel on the side.", 50, { pickup: false, level: 2, number: 1, lastLevel: 2 });
    var vat3 = new Item("vat 3", "A vat of chemicals labeled 'Vat 3'", "A large vat of hydrochloric acid that is at approximatly 2 feet currently. It also has a wheel on the side.", 50, { pickup: false, level: 2, number: 2, lastLevel: 2 });

    function plantContinue(world) {
      inPlant.makeExit(Location.North, plantOffice);
      print(`As you turn the wheel of ${world.lastExamined.name}, you feel a rumble. You see that to the north a wall has opened up to what appears to be a lavish office.`, "", world);
    }

    var wheel = new Item("a wheel", `A wheel, jutting out the side of a vat`, `A wheel, jutting out the side of a vat. It can be turned.`, 50, { pickup: false, use: (world) => { if (!world.lastExamined.name.includes("vat")) { print("Turn which one? Here's a hint: Examine a vat, and then try turning a wheel.", "", world) } else { world.lastExamined.prop.lastLevel = world.lastExamined.prop.level; world.lastExamined.prop.level++; if (world.lastExamined.prop.level > 5) { world.lastExamined.prop.level = 0 } world.lastExamined.ldesc = `A large vat of hydrochloric acid that is at approximatly ${world.lastExamined.prop.level} feet currently. It also has a wheel on the side.`; if (world.lastExamined.prop.level == correctVats[world.lastExamined.prop.number]) { numCorrect++; } else if (world.lastExamined.prop.lastLevel == correctVats[world.lastExamined.prop.number] && world.lastExamined.prop.level != correctVats[world.lastExamined.prop.number]) { numCorrect--; } if (numCorrect == 3) { plantContinue(world) } } } });

    var inPlant = new Room([vat1, vat2, vat3, wheel], "You are inside the plant, a dark and damp place containing vats of chemicals and other horrendous-for-the-environment things.", "Inside the Plant", []);
    inPlant.makeExit(Location.South, outsidePlant);

    function openPlant(world) {
      hiddenPlant.sdesc = "The entrance to the plant. It is unlocked and open.";
      hiddenPlant.ldesc = "The entrance to the plant is open. You can go through it.";
      hiddenPlant.prop.unlocked = true;
      world.current_room.makeExit(Location.North, inPlant);
      print("You unlock and open the plant entrance.", "", world);
    }

    function plantFunc(world) {
      var v;
      for (var i = 0; i < world.inv.length; i++) {
        v = world.inv.items[i];
        if (v.name === "key") {
          try {
            openPlant(world);
          } catch (e) {
            print("Please report this internal error of opening the plant: " + e.toString(), "", world);
          }
        }
      }
    }

    function plantEnter(world) {
      plantFunc(world);
    }

    var plantNote = new Item("note", "A small, hidden note", `It reads:<br>"Vats??? 1-${correctVats[0]} 2-${correctVats[1]} 3-${correctVats[2]}????`);

    var hiddenPlant = new Item("plant", "The entrance to the plant", "The entrance to the rusty chemical plant outside town.", 9999999999, { pickup: false, use: plantFunc, enter: plantEnter });

    var outsidePlant = new Room([carrageItem, hiddenPlant, plantNote], "You're outside the plant, a old building that used to make a majority of the income in the town, before it shut down and was left to rot.", "Outside the Plant", [], { leave: (world, dir) => { if (world.prevroom == world.current_room && dirtonum(dir) == Location.North) { print("The plant appears to be locked with a large and old cast-iron padlock. There's no breaking in to that thing.") } else if (world.prevroom == world.current_room) { print("It's faster to take the carrage.", "", world) } }, leaveMsg: false });
    outsidePlant.makeExit(Location.North, outsidePlant);
    inPlant.makeExit(Location.South, outsidePlant);

    function travel(world, place) {
      if (!(place instanceof Room)) {
        print("Internal error: typeof place != Room", "", world);
        return;
      }
      print(`Traveling to ${place.name}...`, "", world);
      function cont() {
        world.current_room = place;
        that.commands = normalCommands;
        look(world, []);
      }
      setTimeout(cont, Math.floor((Math.random() * 1500) + 1500));
    }
    function farran(world, _inp) {
      travel(world, outsideFarranHouse);
    }
    function factory(world, _inp) {
      travel(world, outsideFactory);
    }
    function postOffice(world, _inp) {
      travel(world, outsidePostOffice);
    }
    function apartments(world, _inp) {
      travel(world, outsideApartments);
    }
    function plantBuilding(world, _inp) {
      travel(world, outsidePlant);
    }
    var carrageCommands = [
      new Command(["farran"], farran, ""),
      new Command(["factory"], factory, ""),
      new Command(["post office"], postOffice, ""),
      new Command(["apartments"], apartments, "")
    ];
    var havePlant = false;

    function carrage(world) {
      that.commands = carrageCommands;

      print(`You are inside the carrage. You can go to the Farran house(with the command \"farran\"), the locomotive factory(with the command \"factory\"), the post office(with the command \"post office\"), ${havePlant ? "the apartments(with the command \"apartments\"), or the plant(with the command \"plant\")" : "or the apartments(with the command \"apartments\")"}.`, "", world);
    }

    //Your house/building

    var outsideHouse = new Room([carrageItem], "The outside of your building.", "Outside Building", { leave: (world) => { if (world.prevroom == world.current_room) { print("It's faster to take the carrage.", "", world) } }, leaveMsg: false });

    var mainRoom = new Room([painting], "The main room of your building.", "Main Room");

    var parlor = new Room([painting, chair], "You stand up quickly and ask, \"Who has gone missing?\" Eli checks a piece of paper and says, \"Mr. and Mrs. Farran, and just those two. I'll give you the list in case you find it helpful.\"", "The parlor", [], { sitting: false, onFirstEnter: (world) => { world.inv.push(peopleList); print("Eli hands you the list before dissappearing.", "", world) } });

    var start = new Room([painting, chair], "You are sitting in your chair, listening to your assistant, Eli Adkins. He's saying that apparently, people have been going missing lately. Good thing you're such a great detective! ", "The parlor (sitting)", [], { sitting: parlor });

    mainRoom.makeExit(Location.South, parlor);
    mainRoom.makeExit(Location.North, outsideHouse);

    parlor.makeExit(Location.North, mainRoom);

    outsideHouse.makeExit(Location.South, mainRoom);
    var handcuffRoom = null;
    function handcuffEnd(world) {
      handcuffRoom.items.splice(handcuffRoom.items.indexOf(handcuffs), 1);
      world.inv.push(handcuffs);
      print("As you are walking, you suddenly feel a slight extra weight in your inventory.", "", world);
    }
    var handcuffTimer = new Timer(this.turns, 3, handcuffEnd, (_world) => { });
    var handcuffs = new Item("handcuffs", "Your pair of handcuffs", "Your pair of handcuffs. Perhaps they'll be useful at the end of the game?", "1", { drop: (world) => { handcuffRoom = world.current_room; handcuffTimer.start = world.turns; world.timers.push(handcuffTimer) } });
    this.inv.push(handcuffs);
    try {
      this.current_room = gameJson.current_room || start;
    } catch (e) {
      this.current_room = start;
    }
    look(this, []);
    send(this);
  }
}
