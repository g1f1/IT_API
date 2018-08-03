const express = require('express')
const router = express.Router()
const fs = require('fs')
const isUtf8 = require('is-utf8')

const auth = require('../../../configs/auth')
const ApplicationErrorClass = require('../../applicationErrorClass')
const apiFunctions = require('../../apiFunctions')
const config = require('../../../configs/config')
const functionsUser = require('./../../user/user/function')
const functions = require('./functions')
const ldapFunctions = require('../../ldapFunctions')
const validSchemas = require('./joi')

let ldapMain = config.LDAP_CLIENT

router.get('/', auth.checkAuth(['cn', 'id'], config.PERMISSIONS.student), getAllUsers)
router.post('/', auth.checkAuth(['cn', 'id'], config.PERMISSIONS.student), apiFunctions.validateInput('body', validSchemas.importUpdateUsers), importUpdateUsers)
router.post('/sendmail', auth.checkAuth(['cn', 'id'], config.PERMISSIONS.student), sendActivationMail)

function getAllUsers (req, res, next) {
  functionsUser.ldapSearchQueryFormat(req.query, false)
    .then(function (options) {
      return ldapFunctions.searchUsersOnLDAP(ldapMain, options)
    }).then(users => {
    let usersSorted = functionsUser.checkForSorting(users, req.query)
    res.status(200).json(usersSorted)
  }).catch(function (applicationError) {
    next(applicationError)
  })
}

function sendActivationMail (req, res, next) {
  let users = req.body.usersID
  if (users) {
    let userIDs = users.split(',')
    functions.sendActivationMailToAllUsers(userIDs).then(() => {
      res.sendStatus(200)
    }).catch(function (applicationError) {
      next(applicationError)
    })
  }
}

global.importInProgress = false

function importUpdateUsers (req, res, next) {
  let fileFullPath
  let fileName
  if (!importInProgress) {
    let file = req.files.users
    fileName = req.files.users.name
    let resultsFinal = {}
    if (functions.fileMimeTypeIsValid(file)) {
      functions.saveFileToPath(file).then(fileFullPathSaved => {
        fileFullPath = fileFullPathSaved
        let file = fs.readFileSync(fileFullPath)
        if (!isUtf8(file)) {
          throw new ApplicationErrorClass('importUpdateUsers', req.user.id, 106, null, 'Η κωδικοποίηση του αρχείου πρέπει να ειναι utf8', apiFunctions.getClientIp(req), 500)
        }
      }).then(() => {
        return functions.createUserByLines(fileFullPath, req.body)
      }).then(users => {
        resultsFinal.startTime = new Date().toISOString()
        return functions.importUsers(users)
      }).then(results => {
        let statistics = functions.buildResults(fileName, results)
        statistics.startTime = resultsFinal.startTime
        statistics.endTime = new Date().toISOString()
        resultsFinal = statistics
        global.importInProgress=false
        res.json(resultsFinal)
      }).catch(function (applicationError) {
        next(applicationError)
      })
    }
  } else {
    res.sendStatus(400)
  }
}





module.exports = {
  router
}