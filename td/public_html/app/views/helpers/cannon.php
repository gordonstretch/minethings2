<? 
class CannonHelper extends AppHelper
{
	var $helpers = array('Html', 'Form', 'ItemList');

	function CannonTable($cannons, $checkboxes, $portals=false)
	{
		$cannonTable = '';

		if (count($cannons))
		{

			$row = array();
			$portal = 1;
			foreach($cannons as $c)
			{
				$element = '<div style="
					float:left; 
					background-color:white; 
					margin:3px; 
					padding:5px; 
					border-style:solid; 
					color:'.$this->ItemList->GetRarityColor($c['rarity']).'
					">';
				if ($checkboxes)
					$element.= $this->Form->input('Cannon.'.$c['checkboxId'].'.selected', array('label' => $c['name'], 'type' => 'checkbox'));					
				else
					$element.= $c['name'].'<br>';
				$element.= '<span style="color:black; font-size:12px;">';
				if ($portals)
					$element.= 'Portal: '.($portal++)."<BR>";
				$element.=
					'Damage: '.$c['damage']
					.'<BR>Rate of Fire: '.$c['rateOfFire']
					.'</span>';
				$element.= '</div>';

				$cannonTable.= $element;
			}
			$cannonTable.= '<div style="clear:left;"></div>';

		}
		else
			$cannonTable.= 'none<BR>';

		return $cannonTable;	
	}

	// used in battles/view
	function CannonHit($shots, $key)
	{
		$shotText = '';
		if (isset($shots[$key]))
		{
			$shot = $shots[$key];
			$shotText.= $shot['shotTypeText'];
			if ($shot['hit'])
				$shotText.= ' '.$shot['damage'].' damage.';
			else
				$shotText.= ' missed.';
		}
		else
			$shotText.= 'No fire';
		return $shotText;
	}
}
?>
