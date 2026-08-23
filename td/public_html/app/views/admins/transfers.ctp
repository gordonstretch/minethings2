<div id="fullcenter">

<?
echo $form->create(NULL, array('action' => 'transfers'));
echo $form->input('Transfer.from_miner_id', array('type' => 'text'));
echo $form->input('Transfer.to_miner_id', array('type' => 'text'));
echo $form->input('Transfer.gold');
echo $form->submit('Send');
if (isset($message)) echo $message;
?>

<table>
<?
echo $html->tableHeaders(array('From', 'To', 'Gold', 'Created', 'Approved'));
foreach ($transfers as $t)
{
	$fromLink = $html->link($t['FromMiner']['name'], '/miners/profile/'.$t['FromMiner']['name']);
	$toLink = $html->link($t['ToMiner']['name'], '/miners/profile/'.$t['ToMiner']['name']);
	echo $html->tableCells(array($fromLink, $toLink, $market->commatize($t['Transfer']['gold']), $t['Transfer']['created'], $t['Transfer']['approved']));
}
?>
</table>
</div>
