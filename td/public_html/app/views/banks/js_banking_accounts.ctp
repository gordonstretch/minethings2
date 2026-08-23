<?
echo $ajax->div($updateDiv);
if (isset($message))
	echo $message;
echo $bank->BankingAccountsTable($accounts, $forBank, $deposits, $updateDiv, $showActive);
echo $ajax->divEnd($updateDiv);
?>