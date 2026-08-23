<div id="fullcenter">
<?

if ($toMinerName)
	$formAction = 'index/'.$toMinerName;
else
	$formAction = 'index';

if (isset($canTransfer))
{
	$toMinerLink = $html->link($toMinerName, '/miners/profile/'.$toMinerName);
	echo "<p>Send gold to $toMinerLink</p>";
	if ($canTransfer)
	{
		echo $form->create('Transfer', array('url' => $formAction));	
		echo $form->input('Transfer.from_miner_id', array('value' => $minerId, 'type' => 'hidden'));
		echo $form->input('Transfer.to_miner_id', array('value' => $toMinerId, 'type' => 'hidden'));
		echo $form->input('Transfer.gold');
		echo $form->end('Send Gold');
	}
	else if (!isset($toMinerId))
		echo "<button disabled>No such miner.</button>";
	else
		echo "<button disabled>You must have an active ledger.</button>";
}
if (isset($message))
	echo "<P>$message</P>";
?>

<h3>Active Transfers</h3>
<? if (count($transfers)): ?>
<table>
<?
echo $html->tableHeaders(array('From', 'To', 'Gold'));
foreach($transfers as $t)
{
	$fromLink = $html->link($t['from'], '/miners/profile/'.$t['from']);
	$toLink = $html->link($t['to'], '/miners/profile/'.$t['to']);

	if ($t['to_miner_id'] == $minerId)
	{
		$approveForm = $form->create('Transfer', array('url' => $formAction));
		$approveForm.= $form->input('Transfer.id', array('type' => 'hidden', 'value' => $t['id']));
		$approveForm.= $form->input('Transfer.approve', array('type' => 'hidden', 'value' => 1));
		$approveForm.= $form->end('Accept');
	}
	else
		$approveForm = '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;';

	if ($t['from_miner_id'] == $minerId)
		$deleteText = 'Cancel';
	else
		$deleteText = 'Reject';		
	$deleteForm = $form->create('Transfer', array('url' => $formAction));
	$deleteForm.= $form->input('Transfer.id', array('type' => 'hidden', 'value' => $t['id']));
	$deleteForm.= $form->input('Transfer.delete', array('type' => 'hidden', 'value' => 1));
	$deleteForm.= $form->end($deleteText);
	
	echo $html->tableCells(array($fromLink, $toLink, $market->commatize($t['gold']), $approveForm, $deleteForm));
}
?>
</table>
<? else: ?>
<P>None</P>
<? endif; ?>

<h3>Completed Transfers</h3>
<? if (count($pastTransfers)): ?>
<table>
<?
echo $html->tableHeaders(array('From', 'To', 'Gold', 'Approved'));
foreach($pastTransfers as $t)
{
	$fromLink = $html->link($t['from'], '/miners/profile/'.$t['from']);
	$toLink = $html->link($t['to'], '/miners/profile/'.$t['to']);
	echo $html->tableCells(array($fromLink, $toLink, $market->commatize($t['gold']), $t['approved']));
}
?>
</table>
<? else: ?>
<P>None</P>
<? endif; ?>

<p>Please remember that is it against <? echo $html->link('the rules', '/miners/help#Rules'); ?> to transfer a significant portion of your wealth to another player or to accept such a transfer from another.  All transfers and sales are monitored for such behavior.  Accounts found in violation will be reset.  Please investigate the sender carefully before accepting any gold transfers.</p>

</div>