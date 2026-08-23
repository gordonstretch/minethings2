<div class="localnav" style="padding-bottom:20px">

<?
$tabs = array(
	array('action' => '/banks/active', 'title' => 'Loans & Deposits'), 
	array('action' => '/banks/index', 'title' => 'Banks'),
	array('action' => '/banks/history', 'title' => 'History'),
	);
	
if (isset($bankerName))
	$tabs[] = array('action' => '/banks/view/'.$bankerName, 'title' => 'Bank of '.$bankerName);
foreach ($tabs as $tab)
{
	
	$anchorAtts = ($this->here == $tab['action']) ? array('class' => 'currentpage') : array();
	echo $html->link($tab['title'], $tab['action'], $anchorAtts); echo '&nbsp;&nbsp';

	/*foreach($mines as $mineTypeName => $mineTypeId) {
		$anchorAtts = array();
		if (isset($selectedMineTypeId) and $mineTypeId == $selectedMineTypeId)
			$anchorAtts = array('class' => 'currentpage');	

		echo $html->link($mineTypeName, '/mine_types/browse/'.$mineTypeId, $anchorAtts); 
		echo "&nbsp;&nbsp;";
	}*/
}
?> 
</div>
