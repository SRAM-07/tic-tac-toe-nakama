local nk = require("nakama")

nk.logger_info("main.lua loaded")

local function create_private_match(context, payload)
  nk.logger_info("create_private_match RPC called")
  local match_id = nk.match_create("tic_tac_toe", {})
  nk.logger_info("Created private match: " .. tostring(match_id))
  return nk.json_encode({ matchId = match_id })
end

nk.register_rpc(create_private_match, "create_private_match")
nk.logger_info("RPC registered")