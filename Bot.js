var Discord = require("discord.js");
var JSONFile = require("jsonfile");
var schedule = require("node-schedule");

var bot = new Discord.Client();
var config = require("./config.json")

var _ = require('lodash');

function is_image(url) {

	var img = new Image();
	img.onerror = function() { return false; }
	img.onload = function() { return true; }
	img.src = url;
}

function nightly () {
	var embed = new Discord.RichEmbed()
	JSONFile.readFile(config.casefile, function(err, caseData) {			
		
		var opens = caseData.outstanding.toString();
		if (opens == "") {
			opens = "None";
		}
		
		console.log("Notifying server owner of open cases: " + opens)
		embed.setAuthor("Open Cases:");
		embed.setDescription(opens)
		
		bot.channels.get(config.inbox).sendEmbed(embed,config.pingee,{ disableEveryone: true })
	});
}

//Notifies server owner (or whoever is desired) each night of the number of open cases
var nightly_notif = schedule.scheduleJob("0 1 * * *", nightly);

function weekly () {
	var embed = new Discord.RichEmbed()

	console.log("Modmeeting")
	embed.setAuthor("Weekly Mod Meeting " + (new Date).toISOString().replace("T", " ").substr(0, 19));
	embed.setDescription("Agenda: First meeting, let's figure things out.")
	
	bot.channels.get(config.meetingroom).sendEmbed(embed,config.mods,{ disableEveryone: true })
}

//Weekly meetings
var weekly_meeting = schedule.scheduleJob("0 21 * * 0", weekly);

function write_config () {
	JSONFile.writeFile("config.json", body, function (err) {
			if (err) { console.error("Error: " + err) }
	})
}

bot.on("ready", () => {
	console.log("Ready and listening.");
	bot.user.setGame(config.statusMsg)
});

bot.on("voiceStateUpdate", (oldMember, newMember) => {
	
	if (oldMember.voiceChannelID != newMember.voiceChannelID) {

		if (oldMember.voiceChannelID in config.channelmap) {
			bot.channels.get(config.channelmap[oldMember.voiceChannelID]).permissionOverwrites.get(newMember.id).delete()
			console.log(newMember.user.username + " left " + oldMember.voiceChannelID)
		}
		
		if (newMember.voiceChannelID in config.channelmap) {
			bot.channels.get(config.channelmap[newMember.voiceChannelID]).overwritePermissions(newMember, {READ_MESSAGES: true})
			console.log(newMember.user.username + " entered " + newMember.voiceChannelID)
		}
	}
});

bot.on("message", message => {

	var replyregex = new RegExp("^"+config.prefix+"\\d+c*:")
	var inbox = bot.channels.get(config.inbox)
	
	if (message.author.bot || message.author in config.blacklist) { 
		return;
	}
	
	if (message.content.toLowerCase().startsWith(config.prefix+"eval") && message.author.id == "99589494897901568") {
			
		try {
			const code = message.content.substr(message.content.indexOf(" "));
			let evaled = eval(code);

			if (typeof evaled !== "string")
				evaled = require("util").inspect(evaled);

			if (!evaled) {
				evaled = "Check logs."
			}
			message.channel.send(evaled, {code:"xl", split:true});
		} catch (err) {
			message.channel.send(`\`ERROR\` \`\`\`xl\n${err}\n\`\`\``);
		}
		
	}
	
	if (message.channel instanceof Discord.DMChannel || message.channel instanceof Discord.GroupDMChannel) {
		
		//Message from user
		
		if (!message.content.startsWith(config.prefix)) {
			
			//New conversation
			
			console.log("Message from user: " + message.author.username + " (" + message.author + "): " + message.content)
			
			JSONFile.readFile(config.casefile, function(err, caseData) {
				
				//Retreive the case number, save the message, increment the case number, and add it to the list of outstanding cases
				casenum = caseData.nextnum
				caseData.cases[casenum] = message
				caseData.nextnum = casenum + 1			
				caseData.outstanding.push(casenum)
				
				//Send the message to the inbox
				var mod_embed = new Discord.RichEmbed()	
				mod_embed.setAuthor("Message #" + casenum)
				mod_embed.setDescription(message.content)
				if(message.attachments != null) {
					for (a of message.attachments.values()) {
						mod_embed.setImage(a.proxyURL)
					}
				}
				inbox.send("",{embed: mod_embed, disableEveryone: true, split: true})
				
				//Send user a delivery confirmation
				var user_embed = new Discord.RichEmbed()
				user_embed.setAuthor("Message sent, your case number is: " + casenum)
				user_embed.addField("_","Use your case number when referring to previous messages.\nTo send a followup to this message, reply with: \n`"+config.prefix+casenum+": Your reply goes here.`\n")
				message.channel.send("",{embed: user_embed, disableEveryone: true})
				
				//Save the data
				JSONFile.writeFile(config.casefile, caseData, function (err) {
					if (err) { console.error("Error: " + err) }
				})
			});
		
		} else {
			
			if (message.content.match(replyregex)) {
	
				//Response to case
				
				console.log("Response from user: " + message.author.username + " (" + message.author + "): " + message.content)
				
				JSONFile.readFile(config.casefile, function(err, caseData) {
					
					//Split up message
					replycasenum = message.content.slice(config.prefix.length, message.content.indexOf(":"))
					newcasenum = caseData.nextnum
					answer = message.content.slice(message.content.indexOf(":")+1)
					
					//Users should only be able to reply to their owned case numbers
					if (caseData.cases[replycasenum].author.id == message.author.id) {
						
						//Save the message, increment the case number, add it to the list of outstanding cases
						caseData.cases[newcasenum] = message
						caseData.nextnum = newcasenum + 1
						caseData.outstanding.push(newcasenum)
						
						//Send the message to the inbox
						var mod_embed = new Discord.RichEmbed()
						mod_embed.setAuthor("Message #"+newcasenum+" in Reply to Message #" + replycasenum)
						mod_embed.setDescription(answer)		
						if(message.attachments != null) {
							for (a of message.attachments.values()) {
								mod_embed.setImage(a.proxyURL)
							}
						}
						inbox.send("",{embed: mod_embed, disableEveryone: true, split: true})

						//Send user a delivery confirmation
						var user_embed = new Discord.RichEmbed()
						user_embed.setAuthor("Message sent, your new case number is: " + newcasenum)
						user_embed.addField("_","Use your case number when referring to previous messages.\nTo send a followup to this message, reply with: \n`"+config.prefix+newcasenum+": Your reply goes here.`\n")
						message.channel.send("",{embed: user_embed, disableEveryone: true})
						
						//Save the data
						JSONFile.writeFile(config.casefile, caseData, function (err) {
							if (err) { console.error("Error: " + err) }
						})
						
					} else {
						message.reply("You cannot respond to a case number that does not belong to you. Please double check the number and try again.")
					}
				});
			} else {
				message.reply("Check your syntax and try again.")
			}
		}
	
	} else if ((message.channel == bot.channels.get(config.inbox)) && message.content.startsWith(config.prefix)) {
		
		//Message from a moderator
		
		if (message.content.startsWith(config.prefix+"ping")) {
		
			//Moderator command: Check if alive
			
			message.reply("pong!")
			
		} else if (message.content.startsWith(config.prefix+"cases")) {
			
			//Moderator command: Check open cases

			console.log("Displaying open cases")
			
			JSONFile.readFile(config.casefile, function(err, caseData) {			
			
				var mod_embed = new Discord.RichEmbed()	
				var opens = caseData.outstanding.toString()
				if (opens == "") {
					mod_embed.setAuthor("No Open Cases")		
				} else {
					mod_embed.setAuthor("Open Cases:")		
					mod_embed.setDescription(opens)
				}
				inbox.send("",{embed: mod_embed, disableEveryone: true})
			});
			
		} else if (message.content.startsWith(config.prefix+"blocked")) {
			
			//Moderator command: Check blocked users

			console.log("Displaying blocked users")
			
			var mod_embed = new Discord.RichEmbed()	
			var blocked = []
			for (blockee of config.blacklist) {
				blocked.push("<@"+blockee+">")
			}
			if (blocked.length == 0) {
				mod_embed.setAuthor("No Blocked Users")		
			} else {
				mod_embed.setAuthor("Blocked Users:")		
				mod_embed.setDescription(blocked.join("\n"))
			}
			inbox.send("",{embed: mod_embed, disableEveryone: true})
			
		} else if (message.content.startsWith(config.prefix+"block")) {
			
			//Moderator command: Block user
			
			tokens = message.content.split(" ")

			if (tokens.length != 2 || isNaN(parseInt(tokens[1]))) {
				message.reply("Usage: `"+config.prefix+"block 1234567890`")
			} else {
			
				console.log("Blocking user")
				
				var mod_embed = new Discord.RichEmbed()	
				
				config.blacklist.push(tokens[1])
				
				mod_embed.setAuthor("User Blocked")		
				mod_embed.setDescription("<@"+tokens[1]+">")
				
				inbox.send("",{embed: mod_embed, disableEveryone: true})
			}
			
		} else if (message.content.startsWith(config.prefix+"unblock")) {
			
			//Moderator command: Unblock user
			
			tokens = message.content.split(" ")

			if (tokens.length != 2 || isNaN(parseInt(tokens[1]))) {
				message.reply("Usage: `"+config.prefix+"unblock 1234567890`")
			} else {
			
				console.log("Unblocking user")
				
				var mod_embed = new Discord.RichEmbed()	
				var toRemove = config.blacklist.indexOf(tokens[1])
				if (toRemove == -1) {
					mod_embed.setAuthor("No such blocked user")		
				} else {
					config.blacklist.splice(toRemove, 1)
					mod_embed.setAuthor("Unblocked User:")		
					mod_embed.setDescription("<@"+tokens[1]+">")
				}
				inbox.send("",{embed: mod_embed, disableEveryone: true})
			}
			
		} else if (message.content.startsWith(config.prefix+"close")) {
			
			//Moderator command: Close a case
		
			tokens = message.content.split(" ")
			
			if (tokens.length != 2) {
				message.reply("Usage: `"+config.prefix+"close 123` or `"+config.prefix+"close 123,456,789` -- (no spaces between cases)")
			} else {
				
				JSONFile.readFile(config.casefile, function(err, caseData) {		
			
					cases = tokens[1].split(",");
					
					closed = []
					notclosed = []
					
					//Check provided numbers
					for (casenumstr of cases) {
			
						casenum = parseInt(casenumstr);
						
						var toRemove = caseData.outstanding.indexOf(casenum);
						if (toRemove > -1) {
							caseData.outstanding.splice(toRemove, 1);
							closed.push(casenum)
							console.log("Closing case #" + casenum)
						} else {
							notclosed.push(casenumstr)
							console.log("Invalid case: " + casenumstr)
						}
					}
					
					//Output results
					if (closed.length > 0) {
						var embed1 = new Discord.RichEmbed()
						embed1.setAuthor("Case(s) Closed: ")
						embed1.setDescription(closed.join(","));
						inbox.send("",{embed: embed1, disableEveryone: true})
					}
					
					if (notclosed.length > 0) {
						var embed2 = new Discord.RichEmbed()
						embed2.setAuthor("Invalid Case(s): ")
						embed2.setDescription(notclosed.join(","));
						inbox.send("",{embed: embed2, disableEveryone: true})
					}
					
					//Save the data
					JSONFile.writeFile(config.casefile, caseData, function (err) {
						if (err) { console.error("Error: " + err) }
					})
				});
			}			
		} else if (message.content.startsWith(config.prefix+"compare")) {
			
			//Moderator command: Compare authors of two messages

			tokens = message.content.split(" ")
			
			if (tokens.length != 3) {
				message.reply("Usage: `"+config.prefix+"compare 1 2`")
			} else {
			
				JSONFile.readFile(config.casefile, function(err, caseData) {			
						
					var mod_embed = new Discord.RichEmbed()
					
					var invalid = []
					if (!(tokens[1] in caseData.cases))
						invalid.push(tokens[1])
					if (!(tokens[2] in caseData.cases))
						invalid.push(tokens[2])
					
					if (invalid.length != 0) {
						mod_embed.setAuthor("Invalid case(s):")
						mod_embed.setDescription(invalid.join(", "))
					} else {
						if (caseData.cases[tokens[1]].author.id == caseData.cases[tokens[2]].author.id) {
							mod_embed.setAuthor("Messages are from the same user")
						} else {
							mod_embed.setAuthor("Messages are not from the same user")
						}
						console.log("Testing cases: " + tokens[1] + " " + tokens[2])
					}
					inbox.send("",{embed: mod_embed, disableEveryone: true})
				});
			}
		} else if (message.content.startsWith(config.prefix+"help")) {
			
			var mod_embed = new Discord.RichEmbed()
			mod_embed.setAuthor("Commands:")
			mod_embed.addField("`"+config.prefix+"ping`","Checks if the bot is alive.")
			mod_embed.addField("`"+config.prefix+"cases`","Lists open cases.")
			mod_embed.addField("`"+config.prefix+"blocked`","Lists blocked users.")
			mod_embed.addField("`"+config.prefix+"block 12345567890`","Blocks a user by their ID.")
			mod_embed.addField("`"+config.prefix+"unblock 12345567890`","Unblocks a user by their ID.")
			mod_embed.addField("`"+config.prefix+"close 123 |or| "+config.prefix+"close 123,456,789`","Closes open cases. Can specify multiple cases in a comma-separated list with no spaces between cases.")
			mod_embed.addField("`"+config.prefix+"compare 1 2`","Checks if two messages were sent by the same user.")
			mod_embed.addField("`"+config.prefix+"123: reply |or| "+config.prefix+"123c: reply and close`","Sends a reply to a case. Adding `c` after the case number will also close it.")
			inbox.send("",{embed: mod_embed, disableEveryone: true, split: true})
			
		} else if (message.content.match(replyregex)) {
			
			//Moderator reply to case
			
			JSONFile.readFile(config.casefile, function(err, caseData) {			
				
				//Retrieve case number and check for close flag
				close = false
				casenum = message.content.slice(config.prefix.length, message.content.indexOf(":"))
				if(casenum.slice(-1) == "c") {
					close = true
					casenum = casenum.slice(0, -1);
				}
				
				answer = message.content.slice(message.content.indexOf(":")+1)
				
				if (answer.replace(/\s+/g, "") == "") {
				
					message.reply("Usage: `"+config.prefix+"123: reply` or `"+config.prefix+"123c: reply and close`")
				} else {
					
					//Forward reply to user
					var user_embed = new Discord.RichEmbed()
					user_embed.setAuthor("Reply to Message #" + casenum + ":")
					user_embed.setDescription(answer)
					user_embed.addField("_","Use your case number when referring to previous messages.\nTo send a reply to this message, reply with: \n`"+config.prefix+casenum+": Your reply goes here.`\n")
					if(message.attachments != null) {
						for (a of message.attachments.values()) {
							user_embed.setImage(a.proxyURL)
						}
					}
					message.guild.members.get(caseData.cases[casenum].author.id).send("",{embed: user_embed, disableEveryone: true})
					
					console.log("Sent reply to " + caseData.cases[casenum].author.username + ", case #" + casenum + "- " + answer)
					
					//Send delivery confirmation to mods
					var mod_embed = new Discord.RichEmbed()
					mod_embed.setAuthor("Reply sent to: ")
					mod_embed.setDescription(casenum)	
					if (close) {
						var toRemove = caseData.outstanding.indexOf(parseInt(casenum));
						if (toRemove > -1) {
							caseData.outstanding.splice(toRemove, 1);
							mod_embed.setAuthor("Message delivered, case closed: " + casenum)
							
						} else {
							mod_embed.setAuthor("Message delivered, case already closed: " + casenum)
						}
					}	
					inbox.send("",{embed: mod_embed, disableEveryone: true})
					
					//Write the data
					JSONFile.writeFile(config.casefile, caseData, function (err) {
						console.error(err)
					})
				}
			});
		} else {
			
			if (((/^\![^\?]+$/).test(message.content))) {
				//Catch anything else with config.prefix
				message.reply("No such command, use `"+config.prefix+"help` for a list of commands.")	
			}
			
		}
	} else if ((message.guild.id == config.modguild) && (message.content.startsWith(config.redditprefix))) {
		
		if (message.content.startsWith(config.redditprefix+"ping")) {
			console.log("Ping from mod server")
			message.reply("pong!")
		} else if (message.content.startsWith(config.redditprefix+"check")) {
			console.log("Check from mod server")
			tokens = message.content.split(" ")
			if (tokens.length != 2) {
				message.reply("Usage: `"+config.redditprefix+"check SolemnScoldingBot`")
			} else {
				user = tokens[1]

				JSONFile.readFile(config.redditinf, function(err, inf) {
					
					if (user in inf) {
						new_off = inf[user]["current"]
						old_off = inf[user]["prior"]
						num_warn = inf[user]["warned"][0]
						last_warn = inf[user]["warned"][1]
						
						desc = "Removals since last warning: " + new_off + "\nRemovals prior to last warning: " + old_off + "\nNumber of warnings: " + num_warn
						
						mod_embed = new Discord.RichEmbed()
						
						timestamp = "Last warning was: Never"
						if (last_warn != 0) {
							timestamp = "Last warning was UTC: " + (new Date(last_warn*1000).toISOString().replace("T", " ").substr(0, 19))
						}
						mod_embed.setDescription(desc)
						mod_embed.setFooter(timestamp)
						mod_embed.setAuthor(user)
						
						message.channel.send("",{embed: mod_embed, disableEveryone: true})
					} else {
						message.channel.send("User has no prior removals on record.")
					}
				});
			}	
		} else if (message.content.startsWith(config.redditprefix+"warn")) {
			console.log("Warn from mod server")
			tokens = message.content.split(" ")
			if (tokens.length != 2) {
				message.reply("Usage: `"+config.redditprefix+"warn SolemnScoldingBot`")
			} else {
				user = tokens[1]

				JSONFile.readFile(config.redditinf, function(err, inf) {
					
					if (user in inf) {
						new_off = inf[user]["current"]
						old_off = inf[user]["prior"]
						combined = new_off + old_off
						num_warn = inf[user]["warned"][0]
						last_warn = inf[user]["warned"][1]
						
						inf[user]["current"] = 0
						inf[user]["prior"] = combined
						inf[user]["warned"][0] += 1
						new_warn = Math.floor((new Date).getTime()/1000)
						inf[user]["warned"][1] = new_warn
						
						JSONFile.writeFile(config.redditinf, inf, function (err) {
							if (err) { console.error("Error: " + err) }
						})
						
						desc = "Removals since last warning: " + new_off + " -> 0\nRemovals prior to last warning: " + old_off + " -> " + combined + "\nNumber of warnings: " + num_warn + " -> " + (num_warn+1)
						
						mod_embed = new Discord.RichEmbed()
						
						timestamp = "Last warning was UTC: " + (new Date(new_warn*1000).toISOString().replace("T", " ").substr(0, 19))
						mod_embed.setDescription(desc)
						mod_embed.setFooter(timestamp)
						mod_embed.setAuthor(user)
						
						message.channel.send("",{embed: mod_embed, disableEveryone: true})
					} else {
						message.reply("Cannot warn a user with no prior removals.")
					}
				});
			}	
		} else if (message.content.startsWith(config.redditprefix+"listcur")) {
			console.log("List from mod server")
			JSONFile.readFile(config.redditinf, function(err, inf) {

				var baddies = _.chain(inf).filter(n => n.current >= 3).orderBy("current", "desc").map(n => n.current + ": " + n.user).value().join("\n")
				console.log(baddies);
				if (baddies == "") {
					message.channel.send("No users with 3 or more current removals.")
				} else {
					message.channel.send("Listing users with 3 or more current removals:\n```" + baddies + "```")
				}
				
			}); 
		} else if (message.content.startsWith(config.redditprefix+"listall")) {
			console.log("Listall from mod server")
			
			JSONFile.readFile(config.redditinf, function(err, inf) {
				var baddies = _.chain(inf).filter(n => (n.prior + n.current) >= 3).orderBy(["current", "prior"], ["desc", "desc"]).map(n => n.current + "+" + n.prior + ": " + n.user).value().join("\n")
				console.log(baddies);
				message.channel.send("Listing users with 3 or more total removals (current + prior):\n```" + baddies + "```")
				
			});
		} else if (message.content.startsWith(config.redditprefix+"listwarn")) {
			console.log("Listwarn from mod server")
			
			JSONFile.readFile(config.redditinf, function(err, inf) {
				var baddies = _.chain(inf).filter(n => n.warned[0] > 0).orderBy(n => n.warned[0], "desc").map(n => n.warned[0] + ": " + n.user).value().join("\n")
				console.log(baddies);
				message.channel.send("Listing total warnings on record:\n```" + baddies + "```")
				
			});
		} else if (message.content.startsWith(config.redditprefix+"help")) {
			
			var mod_embed = new Discord.RichEmbed()
			mod_embed.setAuthor("Commands:")
			mod_embed.addField("`"+config.redditprefix+"ping`","Checks if the bot is alive.")
			mod_embed.addField("`"+config.redditprefix+"check SolemnScoldingBot`","Checks removals and warnings for a user.")
			mod_embed.addField("`"+config.redditprefix+"warn SolemnScoldingBot`","Adds a warning to a user and archives current removals.")
			mod_embed.addField("`"+config.redditprefix+"listcur`","Lists users with 3 or more current removals.")
			mod_embed.addField("`"+config.redditprefix+"listall`","Lists users with 3 or more total removals, ordered by current removals.")
			mod_embed.addField("`"+config.redditprefix+"listwarn`","Lists users with 1 or more warnings.")
			message.channel.send("",{embed: mod_embed, disableEveryone: true, split: true})
			
		} else {
			if (((/^\?[^\?]+$/).test(message.content))) {
				//Catch anything else with config.prefix
				message.reply("No such command, use `"+config.redditprefix+"help` for a list of commands.")	
			}
		}
		
	} else {
		return;
	}
});

bot.login(config.token);

/* 
JSONFile.readFile(<FILENAME>, function(err, <OBJNAME>) {
	//Save the data
	JSONFile.writeFile(<FILENAME>, <OBJNAME>, function (err) {
		if (err) { console.error("Error: " + err) }
	})
}); 
*/
