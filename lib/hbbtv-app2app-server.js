/*******************************************************************************
 * 
 * Copyright (c) 2013 Louay Bassbouss, Fraunhofer FOKUS, All rights reserved.
 * 
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 3.0 of the License, or (at your option) any later version.
 * 
 * This library is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Lesser General Public License for more details.
 * 
 * You should have received a copy of the GNU Lesser General Public
 * License along with this library. If not, see <http://www.gnu.org/licenses/>. 
 * 
 * AUTHORS: Louay Bassbouss (louay.bassbouss@fokus.fraunhofer.de)
 *
 ******************************************************************************/
var ws = require("ws");
var WebSocketServer = ws.Server;
var HbbTVApp2AppServer = function (httpServer, callback) {
	var wsServer = new WebSocketServer({
		server: httpServer,
		verifyClient : function (info,callback) {
            var req = info.req;
            var url = req.url || "";
            var channel = null;
            var verified;
            var code;
			if(url.indexOf("/local/") == 0){
                channel = url.substr(7) || null;
                req.local = true;
            }
            else if(url.indexOf("/remote/") == 0){
                channel = url.substr(8) || null;
                req.local = false;
            }
            if(channel){
                req.channel = channel;
                verified = true;
            }
            else{
                verified = false;
                code = 400;
            }
            try{
                callback(verified,code);
            }
            catch (e){
                console.error("Error on verify client",e);
            }
		}
	});
	var pendingLocalConnections = [];
	var pendingRemoteConnections = [];
	var handlePendingConnectionsChanged = function (channel) {
		var channelPendingLocalConnections = pendingLocalConnections[channel] || [];
		var channelPendingRemoteConnections = pendingRemoteConnections[channel] || [];
		while(channelPendingLocalConnections.length>0 && channelPendingRemoteConnections.length>0){
			var localConnection = channelPendingLocalConnections.pop();
			var remoteConnection = channelPendingRemoteConnections.pop();
			localConnection.pair = remoteConnection;
			remoteConnection.pair = localConnection;
			localConnection.send("pairingcomplete");
			remoteConnection.send("pairingcomplete");
		}
		if(channelPendingLocalConnections.length == 0){
			delete  pendingLocalConnections[channel];
		}
		if(channelPendingRemoteConnections.length == 0){
			delete  pendingRemoteConnections[channel];
		}
	};
	var handleConnectionClosed = function (connection) {
		if(connection.local) {
			var channelPendingLocalConnections = pendingLocalConnections[connection.channel] || [];
			var index = channelPendingLocalConnections.indexOf(connection);
			index >= 0 && channelPendingLocalConnections.splice(index, 1);
			if(channelPendingLocalConnections.length == 0){
				delete  pendingLocalConnections[connection.channel];
			}
			console.log("pending local connection at index ",index,"removed");
		}
		else if(connection.remote){
			var channelPendingRemoteConnections = pendingRemoteConnections[connection.channel] || [];
			var index = channelPendingRemoteConnections.indexOf(connection);
			index >= 0 && pendingRemoteConnections.splice(index, 1);
			console.log("pending remote connection at index ",index,"removed");
			if(channelPendingRemoteConnections.length == 0){
				delete  pendingRemoteConnections[connection.channel];
			}
		}
	};
	wsServer.on("connection", function(connection) {
        var req = connection.upgradeReq;
		if(req.channel){
            var channel = req.channel;
            connection.channel = channel;
            if(req.local){
                 connection.local = true;
                 var channelPendingLocalConnections = pendingLocalConnections[channel] || (pendingLocalConnections[channel] = []);
                 channelPendingLocalConnections.push(connection);
            }
            else {
                connection.remote = true;
                var channelPendingRemoteConnections = pendingRemoteConnections[channel] || (pendingRemoteConnections[channel] = []);
                channelPendingRemoteConnections.push(connection);
            }
			handlePendingConnectionsChanged(channel);
			connection.on("message", function(msg, flags) {
                var options = {};
                flags.binary && (options.binary = true);
                flags.masked && (options.masked = true);
				if (flags && flags.binary) {
                    console.log("Received Binary Message of " + msg.length + " bytes");
					connection.pair && connection.pair.send(msg, options);
				}
				else {
                    console.log("Received Text Message: " + msg);
					connection.pair && connection.pair.send(msg, options);
				}
			});
			connection.on("close", function(code, reason) {
				console.log((new Date()) + " connection disconnected. code:",code,"message: ",reason);
				if(connection.pair){
					connection.pair.close();
					connection.pair = null;
				}
				else {
					handleConnectionClosed(connection);
				}
				connection = null;
			});
		}
		else {
			connection.close();
		}
	});
};

module.exports = HbbTVApp2AppServer;