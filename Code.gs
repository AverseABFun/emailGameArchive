"use strict";

var scriptProperties = PropertiesService.getScriptProperties();


function onSubmit(e) {
  let game = new Game(e.values[1]);
  scriptProperties.setProperty(e.values[1].toString(), JSON.stringify(game, refReplacer()));
}
function activate() {
  ScriptApp.newTrigger('onSubmit')
    .forSpreadsheet('1MThYR1Vb6jMeohnQ42MLMxXxrEt5zXKOkZPYj9sPyno')
    .onFormSubmit()
    .create();
  ScriptApp.newTrigger('emailUpdate')
    .forSpreadsheet('1MThYR1Vb6jMeohnQ42MLMxXxrEt5zXKOkZPYj9sPyno')
    .onChange()
    .create();
  ScriptApp.newTrigger('lookForReplies')
    .timeBased()
    .everyMinutes(10)
    .create();
}

function emailUpdate(e) {
  var updateSheet = SpreadsheetApp.openById("1MThYR1Vb6jMeohnQ42MLMxXxrEt5zXKOkZPYj9sPyno").getSheetByName("Updates");
  var formSheet = SpreadsheetApp.openById("1MThYR1Vb6jMeohnQ42MLMxXxrEt5zXKOkZPYj9sPyno").getSheetByName("Form Responses 1");

  if (updateSheet.getRange(1, 2).getCell(1, 1).getValue().toString() != "TRUE") {
    return;
  }

  var updateData = updateSheet.getRange(updateSheet.getLastRow(), 1, 1, 2);

  var formData = formSheet.getRange(2, 2, formSheet.getLastRow(), 2).getValues();

  var row = null;

  for (var i; i < formData.length; i++) {
    row = formData[i];
    if (row[1] == "Yes") {
      GmailApp.sendEmail(row[0], `Email game "${updateData.getCell(1, 1).getValue().toString()}" update`, updateData.getCell(1, 2).getValue().toString());
    }
  }

}

function lookForReplies(e) {
  GmailApp.getUserLabelByName("emailgame").getThreads().forEach(
    (value) => {
      if (value.isUnread()) {
        var message = value.getMessages()[value.getMessageCount()-1];
        var email = message.getReplyTo();
        if (!email) {
          email = message.getFrom();
        }
        var nameRegex = /^(.*?) <(.*?)>$/;
        var match = email.match(nameRegex);
        if (match) {
          email = match[2];
          if (match[1] == "Email game bot") {
            return;
          }
        }
        try {
          Logger.log(email);
          var game = parseRefJSON(scriptProperties.getProperty(email));
          var realGame = new Game(email, game)
          realGame.__parse(message.getPlainBody().split("Type your command above this line and don't remove this")[0].split("\n")[0]);
          scriptProperties.setProperty(email, JSON.stringify(game, refReplacer()));
          value.markRead();
        } catch (e) { Logger.log(e.toString()) }
      }
    }
  )
}
