<div id=fullcenter>

<? include 'tabs.inc' ?>

<table>
<?
echo $html->tableHeaders(array('Bank', 'Description'));
foreach($banks as $b)
{
	$bank = $html->link('Bank of '.$b['Miner']['name'].' ('.$b['Miner']['meld_count'].')', '/banks/view/'.$b['Miner']['name']);
	$bankId = $b['Bank']['id'];
	$description = $b['Bank']['description'];
	$maxLength = 100;

	if ($b['Bank']['defaults'])
	{
		$maxLength-= 15;
		$description = '[Defaults: '.$b['Bank']['defaults'].'] '.$description;
	}
	$descriptionCell = '<div id="ShortDescriptionDiv'.$bankId.'" style="display:inline">';
	$descriptionCell.= htmlspecialchars(substr($description, 0, $maxLength)).' ';
	if (strlen($b['Bank']['description']) > $maxLength)
		$descriptionCell.= $html->link('more...', '#', array('onclick' => 
		'$("ShortDescriptionDiv'.$bankId.'").hide(); $("DescriptionDiv'.$bankId.'").show(); return false'));
	$descriptionCell.= '</div> ';
	$descriptionCell.= '<div id="DescriptionDiv'.$bankId.'" style="display:none">';
	$descriptionCell.= htmlspecialchars($description);
	$descriptionCell.= '</div> ';
	
	echo $html->tableCells(array(array(
		array($bank, array('style' => 'width:300px')),
		$descriptionCell,
		)));
}
?>
</table>

</div>